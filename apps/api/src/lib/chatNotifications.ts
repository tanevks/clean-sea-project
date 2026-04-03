import { env } from "./env";
import { supabaseAdmin } from "./supabaseAdmin";
import { sendTelegramMessage } from "./telegram";
import type { ReportStatus } from "./reportService";

type ChatMessageTargetRow = {
  channel: "telegram";
  external_chat_id: string;
  user_identity_id: string | null;
};

const statusLabelsBg: Record<ReportStatus, string> = {
  new: "Нов",
  in_review: "В преглед",
  planned_cleanup: "Планирано почистване",
  resolved: "Решен",
  rejected: "Отхвърлен"
};

async function findChatNotificationTarget(reportId: string) {
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("channel, external_chat_id, user_identity_id")
    .eq("report_id", reportId)
    .eq("channel", "telegram")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ChatMessageTargetRow | null) ?? null;
}

async function writeOutboundNotification(params: {
  chatId: string;
  messageId: string;
  userIdentityId: string | null;
  reportId: string;
  payload: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("chat_messages").insert({
    channel: "telegram",
    external_chat_id: params.chatId,
    external_message_id: params.messageId,
    direction: "outbound",
    user_identity_id: params.userIdentityId,
    report_id: params.reportId,
    payload: params.payload
  });

  if (error) {
    throw new Error(error.message);
  }
}

function buildStatusNotificationText(params: {
  reportId: string;
  fromStatus: ReportStatus;
  toStatus: ReportStatus;
  description: string;
  note?: string | null;
}) {
  const lines = [
    "Има промяна по твоя сигнал.",
    `Статус: ${statusLabelsBg[params.fromStatus]} -> ${statusLabelsBg[params.toStatus]}`,
    `Сигнал: #${params.reportId.slice(0, 8)}`,
    `Описание: ${params.description.slice(0, 140)}`
  ];

  if (params.note?.trim()) {
    lines.push(`Бележка: ${params.note.trim()}`);
  }

  return lines.join("\n");
}

export async function notifyChatReportStatusChanged(params: {
  reportId: string;
  source: "mobile" | "web" | "chat";
  fromStatus: ReportStatus;
  toStatus: ReportStatus;
  description: string;
  note?: string | null;
}) {
  if (params.source !== "chat" || !env.TELEGRAM_BOT_TOKEN) {
    return { delivered: false as const, reason: "not-applicable" as const };
  }

  const target = await findChatNotificationTarget(params.reportId);
  if (!target) {
    return { delivered: false as const, reason: "no-target" as const };
  }

  if (target.channel !== "telegram") {
    return { delivered: false as const, reason: "unsupported-channel" as const };
  }

  const text = buildStatusNotificationText(params);
  const sent = await sendTelegramMessage(target.external_chat_id, text);

  await writeOutboundNotification({
    chatId: target.external_chat_id,
    messageId: String(sent.message_id),
    userIdentityId: target.user_identity_id,
    reportId: params.reportId,
    payload: {
      type: "status-update",
      text,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      note: params.note ?? null
    }
  });

  return { delivered: true as const };
}

