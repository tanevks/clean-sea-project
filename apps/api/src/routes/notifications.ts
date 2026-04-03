import { Router } from "express";
import { z } from "zod";
import { authGuard } from "../middleware/authGuard";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const listNotificationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const notificationIdSchema = z.object({
  id: z.string().uuid()
});

type UserNotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  report_id: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
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

function toNotificationResponse(item: UserNotificationRow) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    reportId: item.report_id,
    metadata: item.metadata ?? {},
    isRead: item.is_read,
    readAt: item.read_at,
    createdAt: item.created_at
  };
}

export const notificationsRouter = Router();

notificationsRouter.get("/", authGuard, async (req, res) => {
  const parsed = listNotificationsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query params.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .select("id, user_id, type, title, body, report_id, metadata, is_read, read_at, created_at")
    .eq("user_id", req.authUser!.id)
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (error) {
    const message = isMissingUserNotificationsTable(error.message)
      ? "User notifications table is missing. Run the user notifications migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  res.json({
    items: ((data ?? []) as UserNotificationRow[]).map(toNotificationResponse)
  });
});

notificationsRouter.patch("/:id/read", authGuard, async (req, res) => {
  const parsed = notificationIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid notification id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString()
    })
    .eq("id", parsed.data.id)
    .eq("user_id", req.authUser!.id)
    .select("id, user_id, type, title, body, report_id, metadata, is_read, read_at, created_at")
    .single();

  if (error) {
    const message = isMissingUserNotificationsTable(error.message)
      ? "User notifications table is missing. Run the user notifications migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  res.json(toNotificationResponse(data as UserNotificationRow));
});

notificationsRouter.delete("/:id", authGuard, async (req, res) => {
  const parsed = notificationIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid notification id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { error } = await supabaseAdmin
    .from("user_notifications")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", req.authUser!.id);

  if (error) {
    const message = isMissingUserNotificationsTable(error.message)
      ? "User notifications table is missing. Run the user notifications migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  res.status(204).send();
});

notificationsRouter.post("/read-all", authGuard, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString()
    })
    .eq("user_id", req.authUser!.id)
    .eq("is_read", false)
    .select("id");

  if (error) {
    const message = isMissingUserNotificationsTable(error.message)
      ? "User notifications table is missing. Run the user notifications migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  res.json({
    updatedCount: (data ?? []).length
  });
});
