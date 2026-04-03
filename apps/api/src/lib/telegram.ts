import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  buildStorageKey,
  ensureReportMediaBucket,
  type CreateReportMedia
} from "./reportMedia";
import { env } from "./env";
import { supabaseAdmin } from "./supabaseAdmin";

export type TelegramChat = {
  id: number | string;
};

export type TelegramUser = {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type TelegramLocation = {
  latitude: number;
  longitude: number;
};

export type TelegramPhotoSize = {
  file_id: string;
  file_size?: number;
  width?: number;
  height?: number;
};

export type TelegramVideo = {
  file_id: string;
  mime_type?: string;
  file_size?: number;
  width?: number;
  height?: number;
  duration?: number;
  file_name?: string;
};

export type TelegramDocument = {
  file_id: string;
  mime_type?: string;
  file_size?: number;
  file_name?: string;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  location?: TelegramLocation;
  photo?: TelegramPhotoSize[];
  video?: TelegramVideo;
  document?: TelegramDocument;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

type TelegramKeyboardButton = {
  text: string;
  request_location?: boolean;
};

type TelegramReplyMarkup =
  | {
      remove_keyboard: true;
    }
  | {
      keyboard: TelegramKeyboardButton[][];
      resize_keyboard?: boolean;
      one_time_keyboard?: boolean;
      input_field_placeholder?: string;
    };

type TelegramFileResult = {
  file_path: string;
};

function requireTelegramToken() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is missing.");
  }

  return env.TELEGRAM_BOT_TOKEN;
}

function getTelegramApiBaseUrl() {
  return `https://api.telegram.org/bot${requireTelegramToken()}`;
}

function getTelegramFileBaseUrl() {
  return `https://api.telegram.org/file/bot${requireTelegramToken()}`;
}

async function telegramApi<T>(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`${getTelegramApiBaseUrl()}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Telegram API HTTP ${response.status} on ${method}.`);
  }

  const json = (await response.json()) as TelegramApiResponse<T>;
  if (!json.ok) {
    throw new Error(json.description ?? `Telegram API error on ${method}.`);
  }

  return json.result;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: {
    removeKeyboard?: boolean;
    keyboard?: TelegramKeyboardButton[][];
    oneTimeKeyboard?: boolean;
    inputFieldPlaceholder?: string;
  }
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text
  };

  let replyMarkup: TelegramReplyMarkup | undefined;

  if (options?.removeKeyboard) {
    replyMarkup = {
      remove_keyboard: true
    };
  } else if (options?.keyboard?.length) {
    replyMarkup = {
      keyboard: options.keyboard,
      resize_keyboard: true,
      one_time_keyboard: options.oneTimeKeyboard ?? false,
      input_field_placeholder: options.inputFieldPlaceholder
    };
  }

  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  return telegramApi<{ message_id: number }>("sendMessage", payload);
}

async function getTelegramFile(fileId: string) {
  return telegramApi<TelegramFileResult>("getFile", {
    file_id: fileId
  });
}

function detectImageMime(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function buildTelegramActorId(externalUserId: string) {
  return `telegram-${externalUserId}`;
}

function buildFileName(filePath: string, fallbackExtension: string) {
  const pathPart = filePath.split("?")[0] ?? "";
  const fromPath = pathPart.split("/").pop();
  if (fromPath && fromPath.includes(".")) {
    return fromPath;
  }

  return `${randomUUID()}.${fallbackExtension}`;
}

async function uploadDownloadedTelegramFile(params: {
  externalUserId: string;
  fileId: string;
  filePath: string;
  mimeType: string;
  mediaType: "image" | "video";
  widthPx?: number;
  heightPx?: number;
  durationSeconds?: number;
}) {
  await ensureReportMediaBucket();

  const downloadResponse = await fetch(
    `${getTelegramFileBaseUrl()}/${params.filePath}`
  );

  if (!downloadResponse.ok) {
    throw new Error(`Failed to download Telegram file ${params.fileId}.`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  const sizeBytes = arrayBuffer.byteLength;
  const buffer = Buffer.from(arrayBuffer);
  const fileName = buildFileName(
    params.filePath,
    params.mediaType === "image" ? "jpg" : "mp4"
  );
  const storageKey = buildStorageKey(
    buildTelegramActorId(params.externalUserId),
    fileName
  );

  const upload = await supabaseAdmin.storage
    .from(env.REPORT_MEDIA_BUCKET)
    .upload(storageKey, buffer, {
      contentType: params.mimeType,
      upsert: false
    });

  if (upload.error) {
    throw new Error(upload.error.message);
  }

  const media: CreateReportMedia = {
    storageKey,
    mediaType: params.mediaType,
    mimeType: params.mimeType,
    sizeBytes
  };

  if (params.widthPx) {
    media.widthPx = params.widthPx;
  }
  if (params.heightPx) {
    media.heightPx = params.heightPx;
  }
  if (params.durationSeconds) {
    media.durationSeconds = params.durationSeconds;
  }

  return media;
}

export async function uploadTelegramMessageMedia(
  message: TelegramMessage
): Promise<CreateReportMedia | null> {
  const externalUserId = String(message.from?.id ?? message.chat.id);

  if (message.photo?.length) {
    const photo = [...message.photo].sort(
      (left, right) => (right.file_size ?? 0) - (left.file_size ?? 0)
    )[0];
    const file = await getTelegramFile(photo.file_id);

    return uploadDownloadedTelegramFile({
      externalUserId,
      fileId: photo.file_id,
      filePath: file.file_path,
      mimeType: detectImageMime(file.file_path),
      mediaType: "image",
      widthPx: photo.width,
      heightPx: photo.height
    });
  }

  if (message.video) {
    const file = await getTelegramFile(message.video.file_id);

    return uploadDownloadedTelegramFile({
      externalUserId,
      fileId: message.video.file_id,
      filePath: file.file_path,
      mimeType: message.video.mime_type ?? "video/mp4",
      mediaType: "video",
      widthPx: message.video.width,
      heightPx: message.video.height,
      durationSeconds: message.video.duration
    });
  }

  if (
    message.document &&
    (message.document.mime_type?.startsWith("image/") ||
      message.document.mime_type?.startsWith("video/"))
  ) {
    const mimeType = message.document.mime_type ?? "application/octet-stream";
    const file = await getTelegramFile(message.document.file_id);
    const mediaType = mimeType.startsWith("image/") ? "image" : "video";

    return uploadDownloadedTelegramFile({
      externalUserId,
      fileId: message.document.file_id,
      filePath: file.file_path,
      mimeType: mimeType === "application/octet-stream"
        ? mediaType === "image"
          ? "image/jpeg"
          : "video/mp4"
        : mimeType,
      mediaType
    });
  }

  return null;
}

export function getTelegramDisplayName(user?: TelegramUser) {
  if (!user) {
    return null;
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return `@${user.username}`;
  }

  return `telegram:${user.id}`;
}
