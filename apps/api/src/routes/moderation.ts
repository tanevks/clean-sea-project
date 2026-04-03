import { Router } from "express";
import { z } from "zod";
import { authGuard } from "../middleware/authGuard";
import {
  loadCleanupEventsByReportIds,
  loadCleanupSummaryByReportIds,
  loadReporterProfilesByIds,
  type ReportRow
} from "../lib/reportService";
import { supabaseAdmin } from "../lib/supabaseAdmin";

type InitiativeAlertRow = {
  id: string;
  submitter_name: string;
  category: "idea" | "initiative";
  title: string;
  created_at: string;
};

type InitiativeCommentAlertRow = {
  id: string;
  initiative_id: string;
  author_user_id: string | null;
  message: string;
  created_at: string;
  initiative_submissions:
    | { title: string }
    | Array<{ title: string }>
    | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type ModerationAlertReadRow = {
  entity_type: string;
  entity_id: string;
};

const markAlertReadSchema = z.object({
  entityType: z.enum([
    "new_report",
    "new_initiative",
    "initiative_comment",
    "unscheduled_cleanup"
  ]),
  entityId: z.string().uuid()
});

function requireModerator(role: "citizen" | "moderator" | "admin" | undefined) {
  return role === "moderator" || role === "admin";
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

async function loadReadAlertKeys(moderatorUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("moderation_alert_reads")
    .select("entity_type, entity_id")
    .eq("moderator_user_id", moderatorUserId);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    ((data ?? []) as ModerationAlertReadRow[]).map(
      (item) => `${item.entity_type}:${item.entity_id}`
    )
  );
}

export const moderationRouter = Router();

moderationRouter.use(authGuard);

moderationRouter.get("/alerts", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  try {
    const [
      newReportsResult,
      plannedReportsResult,
      newInitiativesListResult,
      newInitiativeCommentsListResult,
      readAlertKeys
    ] = await Promise.all([
        supabaseAdmin
          .from("reports")
          .select(
            "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
          )
          .eq("status", "new")
          .order("created_at", { ascending: false })
          .limit(12),
        supabaseAdmin
          .from("reports")
          .select(
            "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
          )
          .eq("status", "planned_cleanup")
          .order("created_at", { ascending: false })
          .limit(24),
        supabaseAdmin
          .from("initiative_submissions")
          .select("id, submitter_name, category, title, created_at")
          .eq("status", "new")
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("initiative_comments")
          .select(
            "id, initiative_id, author_user_id, message, created_at, initiative_submissions(title)"
          )
          .eq("visibility", "public")
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .limit(200),
        loadReadAlertKeys(req.authUser!.id)
      ]);

    if (newReportsResult.error) {
      throw new Error(newReportsResult.error.message);
    }
    if (plannedReportsResult.error) {
      throw new Error(plannedReportsResult.error.message);
    }
    if (newInitiativesListResult.error) {
      throw new Error(newInitiativesListResult.error.message);
    }
    if (newInitiativeCommentsListResult.error) {
      throw new Error(newInitiativeCommentsListResult.error.message);
    }

    const newReports = (newReportsResult.data ?? []) as ReportRow[];
    const plannedReports = (plannedReportsResult.data ?? []) as ReportRow[];
    const recentInitiativeComments =
      (newInitiativeCommentsListResult.data ?? []) as InitiativeCommentAlertRow[];

    const plannedReportIds = plannedReports.map((item) => item.id);
    const [reporterProfiles, cleanupEventsByReportId, cleanupSummaryByReportId, commentAuthors] =
      await Promise.all([
        loadReporterProfilesByIds([
          ...newReports.map((item) => item.created_by_user_id ?? ""),
          ...plannedReports.map((item) => item.created_by_user_id ?? "")
        ]),
        loadCleanupEventsByReportIds(plannedReportIds),
        loadCleanupSummaryByReportIds(plannedReportIds),
        loadProfileNamesByIds(
          recentInitiativeComments.map((item) => item.author_user_id ?? "")
        )
      ]);

    const unscheduledCleanups = plannedReports
      .filter((item) => !cleanupEventsByReportId.get(item.id))
      .filter((item) => !readAlertKeys.has(`unscheduled_cleanup:${item.id}`));

    const newInitiatives = ((newInitiativesListResult.data ?? []) as InitiativeAlertRow[]).filter(
      (item) => !readAlertKeys.has(`new_initiative:${item.id}`)
    );
    const newInitiativeComments = recentInitiativeComments.map((item) => ({
      id: item.id,
      initiativeId: item.initiative_id,
      initiativeTitle: Array.isArray(item.initiative_submissions)
        ? item.initiative_submissions[0]?.title ?? "Untitled initiative"
        : item.initiative_submissions?.title ?? "Untitled initiative",
      authorDisplayName: commentAuthors.get(item.author_user_id ?? "") ?? null,
      message: item.message,
      createdAt: item.created_at
    })).filter((item) => !readAlertKeys.has(`initiative_comment:${item.id}`));
    const unreadNewReports = newReports.filter(
      (item) => !readAlertKeys.has(`new_report:${item.id}`)
    );

    res.json({
      generatedAt: new Date().toISOString(),
      counts: {
        newReports: unreadNewReports.length,
        newInitiatives: newInitiatives.length,
        newInitiativeComments: newInitiativeComments.length,
        unscheduledCleanups: unscheduledCleanups.length,
        total:
          unreadNewReports.length +
          newInitiatives.length +
          newInitiativeComments.length +
          unscheduledCleanups.length
      },
      newReports: unreadNewReports.slice(0, 12).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        source: item.source,
        createdAt: item.created_at,
        reporterDisplayName:
          reporterProfiles.get(item.created_by_user_id ?? "")?.display_name ?? null
      })),
      newInitiatives: newInitiatives.slice(0, 12).map((item) => ({
        id: item.id,
        submitterName: item.submitter_name,
        category: item.category,
        title: item.title,
        createdAt: item.created_at
      })),
      newInitiativeComments: newInitiativeComments.slice(0, 12),
      unscheduledCleanups: unscheduledCleanups.slice(0, 12).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        createdAt: item.created_at,
        reporterDisplayName:
          reporterProfiles.get(item.created_by_user_id ?? "")?.display_name ?? null,
        participantCount: cleanupSummaryByReportId.get(item.id)?.participantCount ?? 0
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load moderation alerts.",
      details: error instanceof Error ? error.message : "Unknown moderation alerts error."
    });
  }
});

moderationRouter.post("/alerts/read", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsed = markAlertReadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { error } = await supabaseAdmin
    .from("moderation_alert_reads")
    .upsert({
      moderator_user_id: req.authUser!.id,
      entity_type: parsed.data.entityType,
      entity_id: parsed.data.entityId,
      read_at: new Date().toISOString()
    });

  if (error) {
    res.status(500).json({
      error: "Failed to mark moderation alert as read.",
      details: error.message
    });
    return;
  }

  res.status(204).send();
});

moderationRouter.post("/alerts/read-all", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  try {
    const [newReportsResult, plannedReportsResult, newInitiativesResult, newInitiativeCommentsResult] =
      await Promise.all([
        supabaseAdmin.from("reports").select("id").eq("status", "new"),
        supabaseAdmin.from("reports").select("id").eq("status", "planned_cleanup"),
        supabaseAdmin.from("initiative_submissions").select("id").eq("status", "new"),
        supabaseAdmin
          .from("initiative_comments")
          .select("id")
          .eq("visibility", "public")
          .eq("is_hidden", false)
      ]);

    if (newReportsResult.error) {
      throw new Error(newReportsResult.error.message);
    }
    if (plannedReportsResult.error) {
      throw new Error(plannedReportsResult.error.message);
    }
    if (newInitiativesResult.error) {
      throw new Error(newInitiativesResult.error.message);
    }
    if (newInitiativeCommentsResult.error) {
      throw new Error(newInitiativeCommentsResult.error.message);
    }

    const now = new Date().toISOString();
    const payload = [
      ...((newReportsResult.data ?? []) as Array<{ id: string }>).map((item) => ({
        moderator_user_id: req.authUser!.id,
        entity_type: "new_report",
        entity_id: item.id,
        read_at: now
      })),
      ...((plannedReportsResult.data ?? []) as Array<{ id: string }>).map((item) => ({
        moderator_user_id: req.authUser!.id,
        entity_type: "unscheduled_cleanup",
        entity_id: item.id,
        read_at: now
      })),
      ...((newInitiativesResult.data ?? []) as Array<{ id: string }>).map((item) => ({
        moderator_user_id: req.authUser!.id,
        entity_type: "new_initiative",
        entity_id: item.id,
        read_at: now
      })),
      ...((newInitiativeCommentsResult.data ?? []) as Array<{ id: string }>).map((item) => ({
        moderator_user_id: req.authUser!.id,
        entity_type: "initiative_comment",
        entity_id: item.id,
        read_at: now
      }))
    ];

    if (payload.length > 0) {
      const { error } = await supabaseAdmin.from("moderation_alert_reads").upsert(payload);
      if (error) {
        throw new Error(error.message);
      }
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: "Failed to mark moderation alerts as read.",
      details: error instanceof Error ? error.message : "Unknown alert read error."
    });
  }
});
