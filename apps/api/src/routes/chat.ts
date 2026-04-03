import { Router } from "express";
import { geocodeAddress } from "../lib/geocoding";
import { notifyChatReportStatusChanged } from "../lib/chatNotifications";
import { createReport } from "../lib/reportService";
import {
  assertPointWithinActiveServiceArea,
  OutsideServiceAreaError
} from "../lib/serviceAreas";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { authGuard } from "../middleware/authGuard";
import {
  getTelegramDisplayName,
  sendTelegramMessage,
  uploadTelegramMessageMedia,
  type TelegramLocation,
  type TelegramMessage,
  type TelegramUser
} from "../lib/telegram";
import { env } from "../lib/env";

type ChatChannel = "telegram";

type ChatDraft = {
  step: "idle" | "awaiting_location" | "awaiting_media_or_description" | "awaiting_description";
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
  media?: Array<{
    storageKey: string;
    mediaType: "image" | "video";
    mimeType: string;
    sizeBytes: number;
    widthPx?: number;
    heightPx?: number;
    durationSeconds?: number;
  }>;
};

type ChatIdentityRow = {
  id: string;
  user_id: string | null;
  channel: ChatChannel;
  external_user_id: string;
  external_username: string | null;
  metadata: {
    draft?: ChatDraft;
    displayName?: string | null;
    lastChatId?: string;
  } | null;
};

type ChatMessageRow = {
  id: string;
  channel: ChatChannel;
  external_chat_id: string;
  external_message_id: string | null;
  direction: "inbound" | "outbound";
  user_identity_id: string | null;
  report_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

const reportIdSchema = {
  parse(value: unknown) {
    if (
      !value ||
      typeof value !== "object" ||
      !("id" in value) ||
      typeof value.id !== "string"
    ) {
      throw new Error("Invalid report id.");
    }

    return { id: value.id };
  }
};

const chatRouter = Router();

const BG = {
  start:
    "\u041d\u043e\u0432 \u0441\u0438\u0433\u043d\u0430\u043b. \u0418\u0437\u043f\u0440\u0430\u0442\u0438 \u043b\u043e\u043a\u0430\u0446\u0438\u044f \u043e\u0442 Telegram, \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438 \u043a\u0430\u0442\u043e `42.6977, 23.3219` \u0438\u043b\u0438 Google Maps \u043b\u0438\u043d\u043a \u0441 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438.",
  locationSaved:
    "\u041b\u043e\u043a\u0430\u0446\u0438\u044f\u0442\u0430 \u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u0430. \u0418\u0437\u043f\u0440\u0430\u0442\u0438 \u043f\u043e\u043d\u0435 \u0435\u0434\u043d\u0430 \u0441\u043d\u0438\u043c\u043a\u0430 \u0438\u043b\u0438 \u0432\u0438\u0434\u0435\u043e. \u041c\u0435\u0434\u0438\u044f\u0442\u0430 \u0435 \u0437\u0430\u0434\u044a\u043b\u0436\u0438\u0442\u0435\u043b\u043d\u0430.",
  needLocation:
    "\u041f\u044a\u0440\u0432\u043e \u043c\u0438 \u0438\u0437\u043f\u0440\u0430\u0442\u0438 \u043b\u043e\u043a\u0430\u0446\u0438\u044f, \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438 \u0438\u043b\u0438 Google Maps \u043b\u0438\u043d\u043a \u0441 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438.",
  unsupportedLocation:
    "\u041d\u0435 \u0443\u0441\u043f\u044f\u0445 \u0434\u0430 \u0438\u0437\u0432\u043b\u0435\u043a\u0430 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438. \u0418\u0437\u043f\u043e\u043b\u0437\u0432\u0430\u0439 \u043b\u043e\u043a\u0430\u0446\u0438\u044f \u043e\u0442 Telegram \u0438\u043b\u0438 \u0438\u0437\u043f\u0440\u0430\u0442\u0438 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438 \u0432\u044a\u0432 \u0444\u043e\u0440\u043c\u0430\u0442 `42.6977, 23.3219`.",
  outsideServiceArea:
    "\u0422\u0430\u0437\u0438 \u043b\u043e\u043a\u0430\u0446\u0438\u044f \u0435 \u0438\u0437\u0432\u044a\u043d \u0440\u0430\u0439\u043e\u043d\u0430 \u043d\u0430 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435. \u0418\u0437\u043f\u0440\u0430\u0442\u0438 \u043d\u043e\u0432\u0430 \u043b\u043e\u043a\u0430\u0446\u0438\u044f \u0432 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u044f \u0440\u0430\u0439\u043e\u043d.",
  mediaSaved:
    "\u0424\u0430\u0439\u043b\u044a\u0442 \u0435 \u0437\u0430\u043f\u0438\u0441\u0430\u043d. \u041c\u043e\u0436\u0435\u0448 \u0434\u0430 \u0438\u0437\u043f\u0440\u0430\u0442\u0438\u0448 \u043e\u0449\u0435 \u0441\u043d\u0438\u043c\u043a\u0438/\u0432\u0438\u0434\u0435\u043e \u0438\u043b\u0438 \u043d\u0430\u043f\u0438\u0448\u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043d\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0430.",
  needDescription:
    "\u0418\u0437\u043f\u0440\u0430\u0442\u0438 \u043a\u0440\u0430\u0442\u043a\u043e \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043d\u0430 \u043c\u044f\u0441\u0442\u043e\u0442\u043e. \u041c\u0438\u043d\u0438\u043c\u0443\u043c 5 \u0441\u0438\u043c\u0432\u043e\u043b\u0430.",
  reportCreated:
    "\u0421\u0438\u0433\u043d\u0430\u043b\u044a\u0442 \u0435 \u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0432\u0430\u043d \u0443\u0441\u043f\u0435\u0448\u043d\u043e. \u0411\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u044f. \u041c\u043e\u0436\u0435\u0448 \u0434\u0430 \u0437\u0430\u043f\u043e\u0447\u043d\u0435\u0448 \u043d\u043e\u0432 \u0441 /newreport.",
  cancelled:
    "\u0422\u0435\u043a\u0443\u0449\u0438\u044f\u0442 \u0447\u0435\u0440\u043d\u043e\u0432\u0438 \u0441\u0438\u0433\u043d\u0430\u043b \u0435 \u043e\u0442\u043c\u0435\u043d\u0435\u043d. \u0417\u0430 \u043d\u043e\u0432 \u0441\u0438\u0433\u043d\u0430\u043b \u0438\u0437\u043f\u0440\u0430\u0442\u0438 /newreport.",
  genericHelp:
    "\u0417\u0430 \u043d\u043e\u0432 \u0441\u0438\u0433\u043d\u0430\u043b \u0438\u0437\u043f\u0440\u0430\u0442\u0438 /newreport. \u041f\u043e\u0434\u0434\u044a\u0440\u0436\u0430\u043c \u043b\u043e\u043a\u0430\u0446\u0438\u044f, \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438, Google Maps \u043b\u0438\u043d\u043a, \u0441\u043d\u0438\u043c\u043a\u0430, \u0432\u0438\u0434\u0435\u043e \u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435.",
  processingError:
    "\u0412\u044a\u0437\u043d\u0438\u043a\u043d\u0430 \u0433\u0440\u0435\u0448\u043a\u0430 \u043f\u0440\u0438 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430\u0442\u0430 \u043d\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0430. \u041f\u0440\u043e\u0432\u0435\u0440\u0438 \u043a\u043e\u043d\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044f\u0442\u0430 \u043d\u0430 chat migration-\u0438\u0442\u0435 \u0438 \u043e\u043f\u0438\u0442\u0430\u0439 \u043f\u0430\u043a.",
  duplicateIgnored:
    "\u0422\u043e\u0432\u0430 \u0441\u044a\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u0432\u0435\u0447\u0435 \u0435 \u043e\u0431\u0440\u0430\u0431\u043e\u0442\u0435\u043d\u043e.",
  mediaBeforeLocation:
    "\u041f\u043e\u043b\u0443\u0447\u0438\u0445 \u0444\u0430\u0439\u043b\u0430, \u043d\u043e \u043f\u044a\u0440\u0432\u043e \u043c\u0438 \u0442\u0440\u044f\u0431\u0432\u0430 \u043b\u043e\u043a\u0430\u0446\u0438\u044f. \u0418\u0437\u043f\u0440\u0430\u0442\u0438 \u043b\u043e\u043a\u0430\u0446\u0438\u044f \u043e\u0442 Telegram \u0438\u043b\u0438 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438.",
  descriptionTooShort:
    "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435\u0442\u043e \u0442\u0440\u044f\u0431\u0432\u0430 \u0434\u0430 \u0435 \u043f\u043e\u043d\u0435 5 \u0441\u0438\u043c\u0432\u043e\u043b\u0430."
} as const;

const BUTTONS = {
  newReport: "\u041d\u043e\u0432 \u0441\u0438\u0433\u043d\u0430\u043b",
  cancel: "\u041e\u0442\u043a\u0430\u0437",
} as const;

const locationKeyboard = [[{ text: BUTTONS.newReport }], [{ text: BUTTONS.cancel }]];

const mediaKeyboard = [[{ text: BUTTONS.cancel }]];

const idleKeyboard = [[{ text: BUTTONS.newReport }]];

const INPUT_PLACEHOLDERS = {
  newReport: BUTTONS.newReport,
  location: "\u041b\u043e\u043a\u0430\u0446\u0438\u044f, \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438, \u0430\u0434\u0440\u0435\u0441 \u0438\u043b\u0438 \u043b\u0438\u043d\u043a",
  mediaOrDescription: "\u0421\u043d\u0438\u043c\u043a\u0430, \u0432\u0438\u0434\u0435\u043e \u0438\u043b\u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  description: "\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043d\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0430"
} as const;

function getDraft(metadata: ChatIdentityRow["metadata"]): ChatDraft {
  return (
    metadata?.draft ?? {
      step: "idle",
      media: []
    }
  );
}

function isTelegramMessage(value: unknown): value is TelegramMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "message_id" in value && "chat" in value;
}

function extractCoordinatesFromText(text: string) {
  const patterns = [
    /@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll)=([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/,
    /!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/,
    /\b([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\b/,
    /\b([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }

  return null;
}

function areValidCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function decodeRepeatedly(value: string) {
  let current = value;

  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        break;
      }

      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

function decodeGoogleHtmlValue(value: string) {
  return decodeRepeatedly(value.replace(/&amp;/g, "&").trim());
}

function extractGoogleMapsUrlFromHtml(html: string) {
  const candidates = [
    ...html.matchAll(/continue=([^"'\\s>]+)/gi),
    ...html.matchAll(/https:\/\/www\.google\.com\/maps\/(?:search|place)\/[^"'\\s<]+/gi)
  ];

  for (const candidate of candidates) {
    const rawValue = candidate[1] ?? candidate[0];
    const decoded = decodeGoogleHtmlValue(rawValue);
    if (/https:\/\/www\.google\.com\/maps\//i.test(decoded)) {
      return decoded;
    }
  }

  return "";
}

function extractCoordinatesFromGoogleContent(text: string) {
  const matches = [
    ...text.matchAll(/maps\/search\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi),
    ...text.matchAll(/maps\/place\/([+-]?\d+(?:\.\d+)?),\+?([+-]?\d+(?:\.\d+)?)/gi)
  ];

  for (const match of matches) {
    const latitude = Number.parseFloat(match[1]);
    const longitude = Number.parseFloat(match[2]);
    if (areValidCoordinates(latitude, longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}

function normalizeAddressCandidate(value: string) {
  return decodeRepeatedly(value).replace(/\+/g, " ").trim();
}

function extractAddressCandidateFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const directCandidate =
      url.searchParams.get("q") ??
      url.searchParams.get("query") ??
      url.searchParams.get("daddr");

    if (directCandidate) {
      return normalizeAddressCandidate(directCandidate);
    }

    const placePathMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
    if (placePathMatch?.[1]) {
      return normalizeAddressCandidate(placePathMatch[1]);
    }

    const searchPathMatch = url.pathname.match(/\/maps\/search\/([^/]+)/i);
    if (searchPathMatch?.[1]) {
      return normalizeAddressCandidate(searchPathMatch[1]);
    }
  } catch {
    // Not a URL.
  }

  return "";
}

function looksLikeAddressText(text: string) {
  return /[A-Za-z\u0400-\u04FF]/.test(text);
}

async function expandMapsShortUrl(text: string) {
  if (!/https?:\/\/maps\.app\.goo\.gl\//i.test(text.trim())) {
    return text;
  }

  try {
    const response = await fetch(text, {
      method: "GET",
      redirect: "follow"
    });

    if (response.url && !/https?:\/\/maps\.app\.goo\.gl\//i.test(response.url)) {
      return response.url;
    }

    const responseText = await response.text();
    const extractedFromHtml = extractGoogleMapsUrlFromHtml(responseText);
    if (extractedFromHtml) {
      return extractedFromHtml;
    }
  } catch {
    // Fall back to the original text.
  }

  return text;
}

async function resolveCoordinatesFromInput(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const directCoordinates = extractCoordinatesFromText(normalized);
  if (directCoordinates) {
    return directCoordinates;
  }

  const expanded = await expandMapsShortUrl(normalized);
  const normalizedExpanded = decodeRepeatedly(expanded);

  const parsedCoordinates = extractCoordinatesFromText(normalizedExpanded);
  if (parsedCoordinates) {
    return parsedCoordinates;
  }

  try {
    const candidate = extractAddressCandidateFromUrl(normalizedExpanded);
    if (candidate) {
      const candidateCoordinates = extractCoordinatesFromText(candidate);
      if (candidateCoordinates) {
        return candidateCoordinates;
      }

      const geocodedCandidate = await geocodeAddress(candidate);
      if (geocodedCandidate) {
        return geocodedCandidate;
      }
    }
  } catch {
    // Not a URL, continue.
  }

  const googleCoordinates = extractCoordinatesFromGoogleContent(normalizedExpanded);
  if (googleCoordinates) {
    return googleCoordinates;
  }

  if (looksLikeAddressText(normalizedExpanded)) {
    return geocodeAddress(normalizedExpanded);
  }

  return null;
}

async function loadTelegramIdentity(externalUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_channel_identities")
    .select("id, user_id, channel, external_user_id, external_username, metadata")
    .eq("channel", "telegram")
    .eq("external_user_id", externalUserId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ChatIdentityRow | null) ?? null;
}

async function saveTelegramIdentity(params: {
  externalUserId: string;
  user?: TelegramUser;
  chatId: string;
  draft: ChatDraft;
}) {
  const existing = await loadTelegramIdentity(params.externalUserId);
  const metadata = {
    ...(existing?.metadata ?? {}),
    displayName: getTelegramDisplayName(params.user),
    lastChatId: params.chatId,
    draft: params.draft
  };

  const payload = {
    channel: "telegram",
    external_user_id: params.externalUserId,
    external_username: params.user?.username ?? existing?.external_username ?? null,
    user_id: existing?.user_id ?? null,
    metadata
  };

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("user_channel_identities")
      .update(payload)
      .eq("id", existing.id)
      .select("id, user_id, channel, external_user_id, external_username, metadata")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as ChatIdentityRow;
  }

  const { data, error } = await supabaseAdmin
    .from("user_channel_identities")
    .insert(payload)
    .select("id, user_id, channel, external_user_id, external_username, metadata")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ChatIdentityRow;
}

async function isDuplicateInboundMessage(chatId: string, messageId: string) {
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id")
    .eq("channel", "telegram")
    .eq("direction", "inbound")
    .eq("external_chat_id", chatId)
    .eq("external_message_id", messageId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function writeChatMessage(params: {
  direction: "inbound" | "outbound";
  chatId: string;
  messageId?: string | null;
  identityId?: string | null;
  reportId?: string | null;
  payload: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("chat_messages").insert({
    channel: "telegram",
    external_chat_id: params.chatId,
    external_message_id: params.messageId ?? null,
    direction: params.direction,
    user_identity_id: params.identityId ?? null,
    report_id: params.reportId ?? null,
    payload: params.payload
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function reply(
  chatId: string,
  identityId: string | null,
  text: string,
  reportId?: string,
  options?: {
    removeKeyboard?: boolean;
    keyboard?: Array<Array<{ text: string; request_location?: boolean }>>;
    oneTimeKeyboard?: boolean;
    inputFieldPlaceholder?: string;
  }
) {
  const sent = await sendTelegramMessage(chatId, text, options);
  await writeChatMessage({
    direction: "outbound",
    chatId,
    messageId: String(sent.message_id),
    identityId,
    reportId: reportId ?? null,
    payload: {
      text,
      replyMarkup:
        options?.removeKeyboard
          ? { remove_keyboard: true }
          : options?.keyboard
            ? { keyboard: options.keyboard }
            : null
    }
  });
}

function locationFromTelegram(location: TelegramLocation) {
  return {
    latitude: location.latitude,
    longitude: location.longitude
  };
}

async function createReportFromDraft(params: {
  identity: ChatIdentityRow;
  chatId: string;
  draft: ChatDraft;
  description: string;
}) {
  if (!params.draft.location) {
    throw new Error("Draft location is missing.");
  }

  let created;
  try {
    await assertPointWithinActiveServiceArea(
      params.draft.location.latitude,
      params.draft.location.longitude
    );

    created = await createReport({
      createdByUserId: params.identity.user_id ?? null,
      source: "chat",
      description: params.description,
      location: params.draft.location,
      media: params.draft.media ?? []
    });
  } catch (error) {
    if (error instanceof OutsideServiceAreaError) {
      await saveTelegramIdentity({
        externalUserId: params.identity.external_user_id,
        user: undefined,
        chatId: params.chatId,
        draft: {
          ...params.draft,
          step: "awaiting_location",
          media: params.draft.media ?? []
        }
      });

      await reply(params.chatId, params.identity.id, BG.outsideServiceArea, undefined, {
        keyboard: locationKeyboard,
        inputFieldPlaceholder: INPUT_PLACEHOLDERS.location
      });
      return;
    }

    throw error;
  }

  await saveTelegramIdentity({
    externalUserId: params.identity.external_user_id,
    user: undefined,
    chatId: params.chatId,
    draft: {
      step: "idle",
      media: []
    }
  });

  await reply(
    params.chatId,
    params.identity.id,
    `${BG.reportCreated}\n#${created.report.id.slice(0, 8)}\n${created.report.latitude}, ${created.report.longitude}`,
    created.report.id,
    {
      keyboard: idleKeyboard,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.newReport
    }
  );
}

async function startNewDraft(chatId: string, externalUserId: string, user?: TelegramUser) {
  const identity = await saveTelegramIdentity({
    externalUserId,
    user,
    chatId,
    draft: {
      step: "awaiting_location",
      media: []
    }
  });

  await reply(chatId, identity.id, BG.start, undefined, {
    keyboard: locationKeyboard,
    inputFieldPlaceholder: INPUT_PLACEHOLDERS.location
  });
  return identity;
}

async function cancelDraft(chatId: string, identity: ChatIdentityRow, user?: TelegramUser) {
  await saveTelegramIdentity({
    externalUserId: identity.external_user_id,
    user,
    chatId,
    draft: {
      step: "idle",
      media: []
    }
  });

  await reply(chatId, identity.id, BG.cancelled, undefined, {
    keyboard: idleKeyboard,
    inputFieldPlaceholder: INPUT_PLACEHOLDERS.newReport
  });
}

async function handleLocationResolved(params: {
  identity: ChatIdentityRow;
  chatId: string;
  user?: TelegramUser;
  location: { latitude: number; longitude: number };
}) {
  try {
    await assertPointWithinActiveServiceArea(
      params.location.latitude,
      params.location.longitude
    );
  } catch (error) {
    if (error instanceof OutsideServiceAreaError) {
      await saveTelegramIdentity({
        externalUserId: params.identity.external_user_id,
        user: params.user,
        chatId: params.chatId,
        draft: {
          ...getDraft(params.identity.metadata),
          step: "awaiting_location",
          media: getDraft(params.identity.metadata).media ?? []
        }
      });

      await reply(params.chatId, params.identity.id, BG.outsideServiceArea, undefined, {
        keyboard: locationKeyboard,
        inputFieldPlaceholder: INPUT_PLACEHOLDERS.location
      });
      return;
    }

    throw error;
  }

  await saveTelegramIdentity({
    externalUserId: params.identity.external_user_id,
    user: params.user,
    chatId: params.chatId,
    draft: {
      ...getDraft(params.identity.metadata),
      step: "awaiting_media_or_description",
      location: params.location,
      media: getDraft(params.identity.metadata).media ?? []
    }
  });

  await reply(params.chatId, params.identity.id, BG.locationSaved, undefined, {
    keyboard: mediaKeyboard,
    inputFieldPlaceholder: INPUT_PLACEHOLDERS.mediaOrDescription
  });
}

async function handleTelegramMessage(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const externalUserId = String(message.from?.id ?? message.chat.id);
  const externalMessageId = String(message.message_id);

  if (await isDuplicateInboundMessage(chatId, externalMessageId)) {
    return;
  }

  let identity =
    (await loadTelegramIdentity(externalUserId)) ??
    (await saveTelegramIdentity({
      externalUserId,
      user: message.from,
      chatId,
      draft: {
        step: "idle",
        media: []
      }
    }));

  await writeChatMessage({
    direction: "inbound",
    chatId,
    messageId: externalMessageId,
    identityId: identity.id,
    payload: message as unknown as Record<string, unknown>
  });

  const rawText = (message.text ?? message.caption ?? "").trim();
  const command = rawText.toLowerCase();
  const draft = getDraft(identity.metadata);

  if (
    command === "/start" ||
    command === "/newreport" ||
    command === "/report" ||
    command === "РЅРѕРІ СЃРёРіРЅР°Р»" ||
    command === BUTTONS.newReport.toLowerCase()
  ) {
    await startNewDraft(chatId, externalUserId, message.from);
    return;
  }

  if (command === "/cancel" || command === BUTTONS.cancel.toLowerCase()) {
    await cancelDraft(chatId, identity, message.from);
    return;
  }

  if (draft.step === "idle") {
    if (message.location) {
      identity = await startNewDraft(chatId, externalUserId, message.from);
      await handleLocationResolved({
        identity,
        chatId,
        user: message.from,
        location: locationFromTelegram(message.location)
      });
      return;
    }

    const parsedLocation = rawText ? await resolveCoordinatesFromInput(rawText) : null;
    if (parsedLocation) {
      identity = await startNewDraft(chatId, externalUserId, message.from);
      await handleLocationResolved({
        identity,
        chatId,
        user: message.from,
        location: parsedLocation
      });
      return;
    }

    await reply(chatId, identity.id, BG.genericHelp, undefined, {
      keyboard: idleKeyboard,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.newReport
    });
    return;
  }

  if (draft.step === "awaiting_location") {
    if (message.location) {
      await handleLocationResolved({
        identity,
        chatId,
        user: message.from,
        location: locationFromTelegram(message.location)
      });
      return;
    }

    const parsedLocation = rawText ? await resolveCoordinatesFromInput(rawText) : null;
    if (parsedLocation) {
      await handleLocationResolved({
        identity,
        chatId,
        user: message.from,
        location: parsedLocation
      });
      return;
    }

    await reply(chatId, identity.id, BG.unsupportedLocation, undefined, {
      keyboard: locationKeyboard,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.location
    });
    return;
  }

  if (!draft.location) {
    await reply(chatId, identity.id, BG.needLocation, undefined, {
      keyboard: locationKeyboard,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.location
    });
    return;
  }

  const uploadedMedia = await uploadTelegramMessageMedia(message);
  if (uploadedMedia) {
    const nextDraft: ChatDraft = {
      ...draft,
      step: "awaiting_media_or_description",
      media: [...(draft.media ?? []), uploadedMedia]
    };

    identity = await saveTelegramIdentity({
      externalUserId,
      user: message.from,
      chatId,
      draft: nextDraft
    });

    const captionText = (message.caption ?? "").trim();
    if (captionText.length >= 5) {
      await createReportFromDraft({
        identity,
        chatId,
        draft: nextDraft,
        description: captionText
      });
      return;
    }

    await reply(chatId, identity.id, BG.mediaSaved, undefined, {
      keyboard: mediaKeyboard,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.mediaOrDescription
    });
    return;
  }

  const parsedLocation = rawText ? await resolveCoordinatesFromInput(rawText) : null;
  if (parsedLocation) {
    await handleLocationResolved({
      identity,
      chatId,
      user: message.from,
      location: parsedLocation
    });
    return;
  }

  if (rawText.length === 0) {
    await reply(chatId, identity.id, BG.locationSaved, undefined, {
      keyboard: mediaKeyboard,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.mediaOrDescription
    });
    return;
  }

  if ((draft.media ?? []).length === 0) {
    await reply(chatId, identity.id, BG.locationSaved, undefined, {
      keyboard: mediaKeyboard,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.mediaOrDescription
    });
    return;
  }

  if (rawText.length < 5) {
    await reply(chatId, identity.id, BG.descriptionTooShort, undefined, {
      removeKeyboard: true,
      inputFieldPlaceholder: INPUT_PLACEHOLDERS.description
    });
    return;
  }

  await createReportFromDraft({
    identity,
    chatId,
    draft,
    description: rawText
  });
}

chatRouter.post("/webhook/telegram", async (req, res) => {
  try {
    if (
      env.TELEGRAM_WEBHOOK_SECRET &&
      req.header("x-telegram-bot-api-secret-token") !== env.TELEGRAM_WEBHOOK_SECRET
    ) {
      res.status(401).json({ error: "Invalid Telegram webhook secret." });
      return;
    }

    const update = req.body as TelegramUpdate;
    if (!update || !isTelegramMessage(update.message)) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    await handleTelegramMessage(update.message);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: BG.processingError,
      details: error instanceof Error ? error.message : "Unknown chat error."
    });
  }
});

chatRouter.post("/reports/:id/notify", authGuard, async (req, res) => {
  if (req.authUser?.role !== "moderator" && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  let reportId: string;
  try {
    reportId = reportIdSchema.parse(req.params).id;
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid report id."
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("id, source, status, description")
    .eq("id", reportId)
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to load report for notification.",
      details: error.message
    });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  try {
    const result = await notifyChatReportStatusChanged({
      reportId: data.id,
      source: data.source,
      fromStatus: data.status,
      toStatus: data.status,
      description: data.description,
      note:
        typeof req.body?.message === "string" ? req.body.message.trim() || null : null
    });

    res.status(202).json(result);
  } catch (notificationError) {
    res.status(500).json({
      error: "Failed to send chat notification.",
      details:
        notificationError instanceof Error
          ? notificationError.message
          : "Unknown chat notification error."
    });
  }
});

export { chatRouter };

