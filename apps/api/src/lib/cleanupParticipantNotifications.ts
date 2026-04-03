import { sendTelegramMessage } from "./telegram";
import { supabaseAdmin } from "./supabaseAdmin";
import type { CleanupEventRow, ReportRow } from "./reportService";

type CleanupNotificationType =
  | "cleanup_event_scheduled"
  | "cleanup_event_updated"
  | "cleanup_resolved";

type ParticipantRow = {
  user_id: string;
};

type TelegramIdentityRow = {
  id: string;
  user_id: string;
  external_user_id: string;
};

function isMissingUserNotificationsTable(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("user_notifications") &&
    (normalized.includes("does not exist") || normalized.includes("not found"))
  );
}

function formatScheduledAt(isoString: string) {
  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoString));
}

function buildReportLabel(report: ReportRow) {
  const raw = report.title?.trim() || report.description.trim();
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function buildCleanupNotificationContent(params: {
  type: CleanupNotificationType;
  report: ReportRow;
  cleanupEvent?: CleanupEventRow | null;
  resolutionNote?: string | null;
}) {
  const reportLabel = buildReportLabel(params.report);
  const title =
    params.type === "cleanup_event_scheduled"
      ? "\u041d\u0430\u0441\u0440\u043e\u0447\u0432\u0430\u043d\u0435 \u043d\u0430 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435"
      : params.type === "cleanup_event_updated"
        ? "\u041f\u0440\u043e\u043c\u044f\u043d\u0430 \u0432 \u043d\u0430\u0441\u0440\u043e\u0447\u0432\u0430\u043d\u0435\u0442\u043e"
        : "\u041f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435\u0442\u043e \u0435 \u043f\u0440\u0438\u043a\u043b\u044e\u0447\u0438\u043b\u043e";

  const body =
    params.type === "cleanup_resolved"
      ? `\u0421\u0438\u0433\u043d\u0430\u043b \u201e${reportLabel}\u201c \u0435 \u043c\u0430\u0440\u043a\u0438\u0440\u0430\u043d \u043a\u0430\u0442\u043e \u0440\u0435\u0448\u0435\u043d. \u0411\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u0438\u043c \u0437\u0430 \u0443\u0447\u0430\u0441\u0442\u0438\u0435\u0442\u043e \u0432 \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435\u0442\u043e.${params.resolutionNote?.trim() ? ` \u0411\u0435\u043b\u0435\u0436\u043a\u0430: ${params.resolutionNote.trim()}` : ""}`
      : `${params.type === "cleanup_event_scheduled" ? "\u0418\u043c\u0430 \u043d\u0430\u0441\u0440\u043e\u0447\u0435\u043d\u043e \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435" : "\u0418\u043c\u0430 \u043f\u0440\u043e\u043c\u044f\u043d\u0430 \u043f\u043e \u043d\u0430\u0441\u0440\u043e\u0447\u0435\u043d\u043e\u0442\u043e \u043f\u043e\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435"} ` +
        `\u0437\u0430 \u0441\u0438\u0433\u043d\u0430\u043b \u201e${reportLabel}\u201c \u043d\u0430 ${formatScheduledAt(params.cleanupEvent!.scheduled_at)}. ` +
        `\u0421\u0431\u043e\u0440\u0435\u043d \u043f\u0443\u043d\u043a\u0442: ${params.cleanupEvent!.meeting_address}.`;

  return { title, body, reportLabel };
}

async function loadParticipantUserIds(reportId: string) {
  const { data, error } = await supabaseAdmin
    .from("report_cleanup_participants")
    .select("user_id")
    .eq("report_id", reportId);

  if (error) {
    throw new Error(error.message);
  }

  return [...new Set(((data ?? []) as ParticipantRow[]).map((item) => item.user_id))];
}

async function loadParticipantTelegramIdentities(userIds: string[]) {
  if (userIds.length === 0) {
    return [] as TelegramIdentityRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("user_channel_identities")
    .select("id, user_id, external_user_id")
    .eq("channel", "telegram")
    .in("user_id", userIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as TelegramIdentityRow[];
}

export async function notifyCleanupParticipants(params: {
  type: CleanupNotificationType;
  report: ReportRow;
  cleanupEvent?: CleanupEventRow | null;
  resolutionNote?: string | null;
}) {
  const participantUserIds = await loadParticipantUserIds(params.report.id);
  if (participantUserIds.length === 0) {
    return { deliveredCount: 0 };
  }

  const { title, body, reportLabel } = buildCleanupNotificationContent(params);

  const { error: insertError } = await supabaseAdmin.from("user_notifications").insert(
    participantUserIds.map((userId) => ({
      user_id: userId,
      type: params.type,
      title,
      body,
      report_id: params.report.id,
      metadata: {
        reportLabel,
        scheduledAt: params.cleanupEvent?.scheduled_at ?? null,
        meetingAddress: params.cleanupEvent?.meeting_address ?? null,
        instructionsText: params.cleanupEvent?.instructions_text ?? null,
        toolsNote: params.cleanupEvent?.tools_note ?? null,
        resolutionNote: params.resolutionNote ?? null,
        reportDescription: params.report.description
      }
    }))
  );

  if (insertError) {
    if (isMissingUserNotificationsTable(insertError.message)) {
      throw new Error(
        "User notifications table is missing. Run the user notifications migration first."
      );
    }

    throw new Error(insertError.message);
  }

  const telegramIdentities = await loadParticipantTelegramIdentities(participantUserIds);
  if (telegramIdentities.length > 0) {
    for (const identity of telegramIdentities) {
      try {
        const sent = await sendTelegramMessage(identity.external_user_id, `${title}
${body}`);

        const { error: chatMessageError } = await supabaseAdmin.from("chat_messages").insert({
          channel: "telegram",
          external_chat_id: identity.external_user_id,
          external_message_id: String(sent.message_id),
          direction: "outbound",
          user_identity_id: identity.id,
          report_id: params.report.id,
          payload: {
            type: params.type,
            title,
            body
          }
        });

        if (chatMessageError) {
          console.error("Failed to store cleanup Telegram notification:", chatMessageError.message);
        }
      } catch (telegramError) {
        console.error(
          "Failed to send cleanup participant Telegram notification:",
          telegramError instanceof Error ? telegramError.message : telegramError
        );
      }
    }
  }

  return { deliveredCount: participantUserIds.length };
}
