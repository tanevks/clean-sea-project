import { supabaseAdmin } from "./supabaseAdmin";

type InitiativeNotificationType =
  | "initiative_public_comment"
  | "initiative_plan_ready"
  | "initiative_report_ready";

type InitiativeRow = {
  id: string;
  submitter_user_id: string | null;
  title: string;
  description: string;
};

type InitiativeCommentRow = {
  id: string;
  author_user_id: string | null;
  message: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
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

function buildInitiativeLabel(initiative: InitiativeRow) {
  const raw = initiative.title.trim() || initiative.description.trim();
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

async function loadProfileNamesByIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map<string, string | null>();
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as ProfileRow[]).map((item) => [item.id, item.display_name])
  );
}

async function loadRecipientUserIds(
  initiativeId: string,
  submitterUserId: string | null,
  actorUserId: string | null
) {
  const { data, error } = await supabaseAdmin
    .from("initiative_comments")
    .select("author_user_id")
    .eq("initiative_id", initiativeId)
    .eq("visibility", "public")
    .eq("is_hidden", false);

  if (error) {
    throw new Error(error.message);
  }

  const recipientUserIds = new Set<string>();

  if (submitterUserId && submitterUserId !== actorUserId) {
    recipientUserIds.add(submitterUserId);
  }

  for (const item of (data ?? []) as Array<{ author_user_id: string | null }>) {
    if (item.author_user_id && item.author_user_id !== actorUserId) {
      recipientUserIds.add(item.author_user_id);
    }
  }

  return [...recipientUserIds];
}

function buildNotificationContent(params: {
  type: InitiativeNotificationType;
  initiative: InitiativeRow;
  comment?: InitiativeCommentRow;
  authorDisplayName?: string | null;
}) {
  const initiativeLabel = buildInitiativeLabel(params.initiative);

  if (params.type === "initiative_plan_ready") {
    return {
      title: "Готов план за реализиране",
      body: `Има публикуван план за „${initiativeLabel}“. Планът се чете само през web.`,
      initiativeLabel
    };
  }

  if (params.type === "initiative_report_ready") {
    return {
      title: "Готов доклад за реализиране",
      body: `Има публикуван доклад за „${initiativeLabel}“. Докладът се чете само през web.`,
      initiativeLabel
    };
  }

  const authorLabel = params.authorDisplayName?.trim() || "Потребител";
  return {
    title: "Нов коментар по инициатива",
    body: `${authorLabel} добави нов коментар по „${initiativeLabel}“.`,
    initiativeLabel
  };
}

export async function notifyInitiativeParticipants(params: {
  type: InitiativeNotificationType;
  initiative: InitiativeRow;
  comment?: InitiativeCommentRow;
  actorUserId?: string | null;
}) {
  const actorUserId = params.comment?.author_user_id ?? params.actorUserId ?? null;
  const recipientUserIds = await loadRecipientUserIds(
    params.initiative.id,
    params.initiative.submitter_user_id,
    actorUserId
  );

  if (recipientUserIds.length === 0) {
    return { deliveredCount: 0 };
  }

  const profileNames = await loadProfileNamesByIds([actorUserId ?? ""]);
  const { title, body, initiativeLabel } = buildNotificationContent({
    ...params,
    authorDisplayName: profileNames.get(actorUserId ?? "") ?? null
  });

  const { error } = await supabaseAdmin.from("user_notifications").insert(
    recipientUserIds.map((userId) => ({
      user_id: userId,
      type: params.type,
      title,
      body,
      report_id: null,
      metadata: {
        initiativeId: params.initiative.id,
        commentId: params.comment?.id ?? null,
        initiativeTitle: initiativeLabel,
        commentMessage: params.comment?.message ?? null,
        commentCreatedAt: params.comment?.created_at ?? null,
        webOnly: params.type === "initiative_plan_ready" || params.type === "initiative_report_ready",
        documentType:
          params.type === "initiative_plan_ready"
            ? "plan"
            : params.type === "initiative_report_ready"
              ? "report"
              : null
      }
    }))
  );

  if (error) {
    if (isMissingUserNotificationsTable(error.message)) {
      throw new Error(
        "User notifications table is missing. Run the user notifications migration first."
      );
    }

    throw new Error(error.message);
  }

  return { deliveredCount: recipientUserIds.length };
}
