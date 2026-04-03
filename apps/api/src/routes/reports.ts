import { Router } from "express";
import { z } from "zod";
import { writeAuditLog } from "../lib/auditLog";
import { notifyCleanupParticipants } from "../lib/cleanupParticipantNotifications";
import { notifyChatReportStatusChanged } from "../lib/chatNotifications";
import { resolveCoordinatesFromInput } from "../lib/locationInput";
import {
  assertPointWithinActiveServiceArea,
  listActiveServiceAreas,
  OutsideServiceAreaError
} from "../lib/serviceAreas";
import { authGuard } from "../middleware/authGuard";
import {
  createReportMediaSchema
} from "../lib/reportMedia";
import {
  createReport,
  insertReportMedia,
  loadCampaignsByReportIds,
  loadCleanupEventsByReportIds,
  loadCleanupSummaryByReportIds,
  loadPublicCommentSummaryByReportIds,
  loadResolutionNotesByReportIds,
  loadReporterProfilesByIds,
  loadMediaByReportIds,
  type CleanupEventRow,
  type ReportMediaRow,
  type ReportRow,
  isMissingCleanupEventsTable,
  isMissingCleanupParticipantsTable,
  isMissingReportMediaTable,
  toCleanupEventResponse,
  toReportResponse
} from "../lib/reportService";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const reportStatusSchema = z.enum([
  "new",
  "in_review",
  "planned_cleanup",
  "resolved",
  "rejected"
]);

const createReportSchema = z.object({
  title: z.string().max(120).optional(),
  description: z.string().min(5).max(500),
  source: z.enum(["mobile", "web", "chat"]).optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).optional()
  }),
  media: z.array(createReportMediaSchema).max(10).optional().default([])
});

const listReportsSchema = z.object({
  minLat: z.coerce.number().min(-90).max(90).optional(),
  minLng: z.coerce.number().min(-180).max(180).optional(),
  maxLat: z.coerce.number().min(-90).max(90).optional(),
  maxLng: z.coerce.number().min(-180).max(180).optional(),
  status: reportStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

const reportIdSchema = z.object({
  id: z.string().uuid()
});

const updateReportStatusSchema = z.object({
  status: reportStatusSchema,
  note: z.string().min(1).max(1000).optional()
});

const updateReportCampaignSchema = z.object({
  campaignId: z.string().uuid().nullable()
});

const commentVisibilitySchema = z.enum(["public", "internal"]);

const createCommentSchema = z.object({
  message: z.string().min(1).max(1000),
  visibility: commentVisibilitySchema.optional().default("internal")
});

const commentIdSchema = z.object({
  id: z.string().uuid(),
  commentId: z.string().uuid()
});

const mediaIdSchema = z.object({
  id: z.string().uuid(),
  mediaId: z.string().uuid()
});

const cleanupParticipantIdSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid()
});

const moderateCommentSchema = z.object({
  isHidden: z.boolean(),
  reason: z.string().min(1).max(500).optional()
});

const moderateMediaSchema = z.object({
  isHidden: z.boolean(),
  reason: z.string().min(1).max(500).optional()
});

const updateCleanupEventSchema = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }),
    meetingAddress: z.string().min(3).max(240),
    meetingLatitude: z.number().min(-90).max(90).nullable().optional(),
    meetingLongitude: z.number().min(-180).max(180).nullable().optional(),
    instructionsText: z.string().min(3).max(4000),
    toolsNote: z.string().min(1).max(1500).nullable().optional()
  })
  .superRefine((value, ctx) => {
    const hasLat = value.meetingLatitude !== undefined && value.meetingLatitude !== null;
    const hasLng = value.meetingLongitude !== undefined && value.meetingLongitude !== null;

    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Meeting latitude and longitude must be provided together.",
        path: hasLat ? ["meetingLongitude"] : ["meetingLatitude"]
      });
    }
  });

type ReportStatusHistoryRow = {
  id?: string;
  report_id: string;
  from_status: z.infer<typeof reportStatusSchema> | null;
  to_status: z.infer<typeof reportStatusSchema>;
  changed_by_user_id: string | null;
  note: string | null;
  created_at?: string;
};

type ReportCommentRow = {
  id: string;
  report_id: string;
  author_user_id: string | null;
  visibility: "public" | "internal";
  message: string;
  is_hidden?: boolean;
  hidden_at?: string | null;
  hidden_by_user_id?: string | null;
  hidden_reason?: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type ReportCleanupParticipantRow = {
  id: string;
  report_id: string;
  user_id: string;
  joined_at: string;
};

type CleanupEventResponse = {
  id: string;
  scheduledAt: string;
  meetingAddress: string;
  meetingLocation: {
    latitude: number;
    longitude: number;
  } | null;
  instructionsText: string;
  toolsNote: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

function requireModerator(
  role: "citizen" | "moderator" | "admin" | undefined
) {
  return role === "moderator" || role === "admin";
}

function requireAdmin(role: "citizen" | "moderator" | "admin" | undefined) {
  return role === "admin";
}

function isPublicReportStatus(status: z.infer<typeof reportStatusSchema>) {
  return status === "in_review" || status === "planned_cleanup" || status === "rejected";
}

async function canAccessReport(
  authUser:
    | {
        id: string;
        role: "citizen" | "moderator" | "admin";
      }
    | undefined,
  report: ReportRow
) {
  if (!authUser) {
    return false;
  }

  if (requireModerator(authUser.role)) {
    return true;
  }

  if (report.created_by_user_id === authUser.id) {
    return true;
  }

  if (report.status === "resolved") {
    return false;
  }

  return isPublicReportStatus(report.status);
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

async function loadCleanupParticipantsByReportId(reportId: string) {
  const { data, error } = await supabaseAdmin
    .from("report_cleanup_participants")
    .select("id, report_id, user_id, joined_at")
    .eq("report_id", reportId)
    .order("joined_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as ReportCleanupParticipantRow[];
  const profileNames = await loadProfileNamesByIds(rows.map((item) => item.user_id));

  return rows.map((item) => ({
    id: item.id,
    userId: item.user_id,
    displayName: profileNames.get(item.user_id) ?? null,
    joinedAt: item.joined_at
  }));
}

async function hasCleanupEvidence(reportId: string) {
  const { count, error } = await supabaseAdmin
    .from("report_media")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId)
    .eq("media_context", "cleanup_evidence");

  if (error) {
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

async function isCleanupParticipant(reportId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("report_cleanup_participants")
    .select("id")
    .eq("report_id", reportId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function canUploadCleanupMedia(
  authUser:
    | {
        id: string;
        role: "citizen" | "moderator" | "admin";
      }
    | undefined,
  report: ReportRow
) {
  if (!authUser) {
    return false;
  }

  if (requireModerator(authUser.role)) {
    return true;
  }

  if (report.status !== "planned_cleanup") {
    return false;
  }

  if (report.created_by_user_id === authUser.id) {
    return true;
  }

  return isCleanupParticipant(report.id, authUser.id);
}

async function canAccessResolvedSummary(
  authUser:
    | {
        id: string;
        role: "citizen" | "moderator" | "admin";
      }
    | undefined,
  report: ReportRow
) {
  if (!authUser) {
    return false;
  }

  if (requireModerator(authUser.role)) {
    return true;
  }

  if (report.status !== "resolved") {
    return false;
  }

  if (report.created_by_user_id === authUser.id) {
    return true;
  }

  return isCleanupParticipant(report.id, authUser.id);
}

function toHistoryResponse(
  item: ReportStatusHistoryRow,
  displayName: string | null | undefined
) {
  return {
    id: item.id,
    fromStatus: item.from_status,
    toStatus: item.to_status,
    changedByUserId: item.changed_by_user_id,
    changedByDisplayName: displayName ?? null,
    note: item.note,
    createdAt: item.created_at
  };
}

function toCommentResponse(
  item: ReportCommentRow,
  displayName: string | null | undefined
) {
  return {
    id: item.id,
    authorUserId: item.author_user_id,
    authorDisplayName: displayName ?? null,
    visibility: item.visibility,
    message: item.message,
    isHidden: item.is_hidden ?? false,
    hiddenAt: item.hidden_at ?? null,
    hiddenByUserId: item.hidden_by_user_id ?? null,
    hiddenReason: item.hidden_reason ?? null,
    createdAt: item.created_at
  };
}

export const reportsRouter = Router();

reportsRouter.get("/", authGuard, async (req, res) => {
  const includeHiddenMedia = requireModerator(req.authUser?.role);
  const parsed = listReportsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query params.",
      details: parsed.error.flatten()
    });
    return;
  }

  const query = supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.status) {
    query.eq("status", parsed.data.status);
  }
  if (parsed.data.minLat !== undefined) {
    query.gte("latitude", parsed.data.minLat);
  }
  if (parsed.data.maxLat !== undefined) {
    query.lte("latitude", parsed.data.maxLat);
  }
  if (parsed.data.minLng !== undefined) {
    query.gte("longitude", parsed.data.minLng);
  }
  if (parsed.data.maxLng !== undefined) {
    query.lte("longitude", parsed.data.maxLng);
  }
  if (!requireModerator(req.authUser?.role)) {
    query.neq("status", "resolved");
    query.or(
      `created_by_user_id.eq.${req.authUser!.id},status.in.(in_review,planned_cleanup,rejected)`
    );
  }

  const { data, error } = await query;
  if (error) {
    res.status(500).json({
      error: "Failed to fetch reports.",
      details: error.message
    });
    return;
  }

  try {
    const reportRows = (data ?? []) as ReportRow[];

    const mediaByReportId = await loadMediaByReportIds(
      reportRows.map((report) => report.id),
      { includeHidden: includeHiddenMedia }
    );
    const commentSummaryByReportId = await loadPublicCommentSummaryByReportIds(
      reportRows.map((report) => report.id)
    );
    const cleanupEventsByReportId = await loadCleanupEventsByReportIds(
      reportRows.map((report) => report.id)
    );
    const campaignsByReportId = await loadCampaignsByReportIds(
      reportRows.map((report) => report.id)
    );
    const cleanupSummaryByReportId = await loadCleanupSummaryByReportIds(
      reportRows.map((report) => report.id)
    );
    const resolutionNotesByReportId = await loadResolutionNotesByReportIds(
      reportRows.map((report) => report.id)
    );
    const reporterProfiles = await loadReporterProfilesByIds(
      reportRows.map((report) => report.created_by_user_id ?? "")
    );

    res.json({
      items: reportRows.map((report) =>
        toReportResponse(
          report,
          mediaByReportId.get(report.id) ?? [],
          reporterProfiles.get(report.created_by_user_id ?? "")?.display_name ?? null,
          commentSummaryByReportId.get(report.id),
          cleanupEventsByReportId.get(report.id) ?? null,
          cleanupSummaryByReportId.get(report.id),
          resolutionNotesByReportId.get(report.id) ?? null,
          campaignsByReportId.get(report.id) ?? null
        )
      ),
      nextCursor: null
    });
  } catch (mediaError) {
    res.status(500).json({
      error: "Failed to fetch report media.",
      details:
        mediaError instanceof Error ? mediaError.message : "Unknown media error."
    });
  }
});

reportsRouter.get("/service-areas", authGuard, async (_req, res) => {
  try {
    const items = await listActiveServiceAreas();
    res.json({ items });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load active service areas.",
      details: error instanceof Error ? error.message : "Unknown service area error."
    });
  }
});

reportsRouter.post("/", authGuard, async (req, res) => {
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  const payload = parsed.data;

  try {
    await assertPointWithinActiveServiceArea(
      payload.location.latitude,
      payload.location.longitude
    );

    const created = await createReport({
      createdByUserId: req.authUser!.id,
      source: payload.source ?? "mobile",
      title: payload.title ?? null,
      description: payload.description,
      location: payload.location,
      media: payload.media
    });

    const reporterProfiles = await loadReporterProfilesByIds([
      created.report.created_by_user_id ?? ""
    ]);

    res.status(201).json(
      toReportResponse(
        created.report,
        created.media,
        reporterProfiles.get(created.report.created_by_user_id ?? "")?.display_name ?? null,
        undefined,
        null
      )
    );
  } catch (error) {
    if (error instanceof OutsideServiceAreaError) {
      res.status(400).json({
        error: "Сигналът е извън района на действие."
      });
      return;
    }

    res.status(500).json({
      error: "Failed to create report.",
      details: error instanceof Error ? error.message : "Unknown create error."
    });
  }
});

reportsRouter.post("/:id/media", authGuard, async (req, res) => {
  const parsedParams = reportIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = z
    .object({
      media: z.array(createReportMediaSchema).min(1).max(10)
    })
    .safeParse(req.body);

  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report || !(await canAccessReport(req.authUser, report))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  let canUpload = false;
  try {
    canUpload = await canUploadCleanupMedia(req.authUser, report);
  } catch (error) {
    const message =
      error instanceof Error &&
      isMissingCleanupParticipantsTable(error.message)
        ? "Cleanup participants table is missing. Run the cleanup participants migration first."
        : error instanceof Error
          ? error.message
          : "Unknown cleanup permission error.";

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  if (!canUpload) {
    res.status(403).json({
      error:
        "Only cleanup participants, the report author, or moderators can upload cleanup media while cleanup is being planned."
    });
    return;
  }

  try {
    await insertReportMedia(report.id, parsedBody.data.media, {
      mediaContext: "cleanup_evidence",
      uploadedByUserId: req.authUser!.id
    });
    const mediaByReportId = await loadMediaByReportIds([report.id], {
      includeHidden: requireModerator(req.authUser?.role)
    });
    const commentSummaryByReportId = await loadPublicCommentSummaryByReportIds([report.id]);
    const cleanupEventsByReportId = await loadCleanupEventsByReportIds([report.id]);
    const campaignsByReportId = await loadCampaignsByReportIds([report.id]);
    const cleanupSummaryByReportId = await loadCleanupSummaryByReportIds([report.id]);
    const resolutionNotesByReportId = await loadResolutionNotesByReportIds([report.id]);
    const reporterProfiles = await loadReporterProfilesByIds([
      report.created_by_user_id ?? ""
    ]);

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: "cleanup_media_uploaded",
      entityType: "report",
      entityId: report.id,
      reportId: report.id,
      metadata: {
        mediaCount: parsedBody.data.media.length
      }
    });

    res.status(201).json(
      toReportResponse(
        report,
        mediaByReportId.get(report.id) ?? [],
        reporterProfiles.get(report.created_by_user_id ?? "")?.display_name ?? null,
        commentSummaryByReportId.get(report.id),
        cleanupEventsByReportId.get(report.id) ?? null,
        cleanupSummaryByReportId.get(report.id),
        resolutionNotesByReportId.get(report.id) ?? null,
        campaignsByReportId.get(report.id) ?? null
      )
    );
  } catch (error) {
    res.status(500).json({
      error: "Failed to upload report media.",
      details: error instanceof Error ? error.message : "Unknown media upload error."
    });
  }
});

reportsRouter.get("/:id/resolved-summary", authGuard, async (req, res) => {
  const includeHiddenMedia = requireModerator(req.authUser?.role);
  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to fetch report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report || !(await canAccessResolvedSummary(req.authUser, report))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  try {
    const mediaByReportId = await loadMediaByReportIds([report.id], {
      includeHidden: includeHiddenMedia
    });
    const commentSummaryByReportId = await loadPublicCommentSummaryByReportIds([report.id]);
    const cleanupEventsByReportId = await loadCleanupEventsByReportIds([report.id]);
    const campaignsByReportId = await loadCampaignsByReportIds([report.id]);
    const cleanupSummaryByReportId = await loadCleanupSummaryByReportIds([report.id]);
    const resolutionNotesByReportId = await loadResolutionNotesByReportIds([report.id]);
    const reporterProfiles = await loadReporterProfilesByIds([
      report.created_by_user_id ?? ""
    ]);

    res.json(
      toReportResponse(
        report,
        mediaByReportId.get(report.id) ?? [],
        reporterProfiles.get(report.created_by_user_id ?? "")?.display_name ?? null,
        commentSummaryByReportId.get(report.id),
        cleanupEventsByReportId.get(report.id) ?? null,
        cleanupSummaryByReportId.get(report.id),
        resolutionNotesByReportId.get(report.id) ?? null,
        campaignsByReportId.get(report.id) ?? null
      )
    );
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch resolved summary.",
      details: error instanceof Error ? error.message : "Unknown summary error."
    });
  }
});

reportsRouter.get("/:id", authGuard, async (req, res) => {
  const includeHiddenMedia = requireModerator(req.authUser?.role);
  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to fetch report.",
      details: error.message
    });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  if (!(await canAccessReport(req.authUser, data as ReportRow))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  try {
    const mediaByReportId = await loadMediaByReportIds([data.id], {
      includeHidden: includeHiddenMedia
    });
    const commentSummaryByReportId = await loadPublicCommentSummaryByReportIds([data.id]);
    const cleanupEventsByReportId = await loadCleanupEventsByReportIds([data.id]);
    const campaignsByReportId = await loadCampaignsByReportIds([data.id]);
    const cleanupSummaryByReportId = await loadCleanupSummaryByReportIds([data.id]);
    const resolutionNotesByReportId = await loadResolutionNotesByReportIds([data.id]);
    const reporterProfiles = await loadReporterProfilesByIds([
      (data as ReportRow).created_by_user_id ?? ""
    ]);
    res.json(
      toReportResponse(
        data as ReportRow,
        mediaByReportId.get(data.id) ?? [],
        reporterProfiles.get((data as ReportRow).created_by_user_id ?? "")?.display_name ?? null,
        commentSummaryByReportId.get(data.id),
        cleanupEventsByReportId.get(data.id) ?? null,
        cleanupSummaryByReportId.get(data.id),
        resolutionNotesByReportId.get(data.id) ?? null,
        campaignsByReportId.get(data.id) ?? null
      )
    );
  } catch (mediaError) {
    res.status(500).json({
      error: "Failed to fetch report media.",
      details:
        mediaError instanceof Error ? mediaError.message : "Unknown media error."
    });
  }
});

reportsRouter.put("/:id/campaign", authGuard, async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsedParams = reportIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = updateReportCampaignSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  if (parsedBody.data.campaignId) {
    const campaignResult = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .eq("id", parsedBody.data.campaignId)
      .maybeSingle();

    if (campaignResult.error) {
      res.status(500).json({
        error: "Failed to load campaign.",
        details: campaignResult.error.message
      });
      return;
    }

    if (!campaignResult.data) {
      res.status(404).json({ error: "Campaign not found." });
      return;
    }

    const { error } = await supabaseAdmin.from("report_campaigns").upsert(
      {
        report_id: report.id,
        campaign_id: parsedBody.data.campaignId,
        assigned_by_user_id: req.authUser!.id
      },
      {
        onConflict: "report_id"
      }
    );

    if (error) {
      res.status(500).json({
        error: "Failed to assign campaign.",
        details: error.message
      });
      return;
    }
  } else {
    const { error } = await supabaseAdmin
      .from("report_campaigns")
      .delete()
      .eq("report_id", report.id);

    if (error) {
      res.status(500).json({
        error: "Failed to clear campaign assignment.",
        details: error.message
      });
      return;
    }
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: parsedBody.data.campaignId ? "report_campaign_assigned" : "report_campaign_cleared",
    entityType: "report_campaign",
    entityId: report.id,
    reportId: report.id,
    metadata: {
      campaignId: parsedBody.data.campaignId
    }
  });

  try {
    const mediaByReportId = await loadMediaByReportIds([report.id], {
      includeHidden: requireModerator(req.authUser?.role)
    });
    const commentSummaryByReportId = await loadPublicCommentSummaryByReportIds([report.id]);
    const cleanupEventsByReportId = await loadCleanupEventsByReportIds([report.id]);
    const cleanupSummaryByReportId = await loadCleanupSummaryByReportIds([report.id]);
    const resolutionNotesByReportId = await loadResolutionNotesByReportIds([report.id]);
    const reporterProfiles = await loadReporterProfilesByIds([
      report.created_by_user_id ?? ""
    ]);
    const campaignsByReportId = await loadCampaignsByReportIds([report.id]);

    res.json(
      toReportResponse(
        report,
        mediaByReportId.get(report.id) ?? [],
        reporterProfiles.get(report.created_by_user_id ?? "")?.display_name ?? null,
        commentSummaryByReportId.get(report.id),
        cleanupEventsByReportId.get(report.id) ?? null,
        cleanupSummaryByReportId.get(report.id),
        resolutionNotesByReportId.get(report.id) ?? null,
        campaignsByReportId.get(report.id) ?? null
      )
    );
  } catch (error) {
    res.status(500).json({
      error: "Campaign updated, but failed to enrich report.",
      details: error instanceof Error ? error.message : "Unknown campaign assignment error."
    });
  }
});

reportsRouter.patch("/:id/status", authGuard, async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsedParams = reportIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = updateReportStatusSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const currentReportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsedParams.data.id)
    .single();

  if (currentReportResult.error) {
    res.status(500).json({
      error: "Failed to load current report state.",
      details: currentReportResult.error.message
    });
    return;
  }
  if (!currentReportResult.data) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  const currentReport = currentReportResult.data as ReportRow;
  const nextStatus = parsedBody.data.status;

  if (nextStatus === "resolved") {
    try {
      const cleanupEvidenceExists = await hasCleanupEvidence(currentReport.id);
      if (!cleanupEvidenceExists) {
        res.status(409).json({
          error:
            "Cleanup cannot be marked as resolved before at least one post-cleanup photo or video is uploaded."
        });
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown cleanup evidence error.";

      res.status(500).json({
        error: "Failed to validate cleanup evidence.",
        details: message
      });
      return;
    }
  }

  const resolvedAt =
    nextStatus === "resolved"
      ? new Date().toISOString()
      : currentReport.status === "resolved"
        ? null
        : undefined;

  const updatePayload: {
    status: z.infer<typeof reportStatusSchema>;
    resolved_at?: string | null;
  } = {
    status: nextStatus
  };

  if (resolvedAt !== undefined) {
    updatePayload.resolved_at = resolvedAt;
  }

  const { data, error } = await supabaseAdmin
    .from("reports")
    .update(updatePayload)
    .eq("id", parsedParams.data.id)
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update report status.",
      details: error.message
    });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  const historyPayload: ReportStatusHistoryRow = {
    report_id: parsedParams.data.id,
    from_status: currentReport.status,
    to_status: nextStatus,
    changed_by_user_id: req.authUser!.id,
    note: parsedBody.data.note ?? null
  };

  const historyInsert = await supabaseAdmin
    .from("report_status_history")
    .insert(historyPayload);

  if (historyInsert.error) {
    res.status(500).json({
      error: "Status updated, but failed to write history.",
      details: historyInsert.error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "report_status_changed",
    entityType: "report",
    entityId: parsedParams.data.id,
    reportId: parsedParams.data.id,
    metadata: {
      fromStatus: currentReport.status,
      toStatus: nextStatus,
      note: parsedBody.data.note ?? null
    }
  });

  try {
    const mediaByReportId = await loadMediaByReportIds([data.id], {
      includeHidden: true
    });
    const commentSummaryByReportId = await loadPublicCommentSummaryByReportIds([data.id]);
    const cleanupEventsByReportId = await loadCleanupEventsByReportIds([data.id]);
    const campaignsByReportId = await loadCampaignsByReportIds([data.id]);
    const cleanupSummaryByReportId = await loadCleanupSummaryByReportIds([data.id]);
    const resolutionNotesByReportId = await loadResolutionNotesByReportIds([data.id]);
    const reporterProfiles = await loadReporterProfilesByIds([
      (data as ReportRow).created_by_user_id ?? ""
    ]);
    res.json(
      toReportResponse(
        data as ReportRow,
        mediaByReportId.get(data.id) ?? [],
        reporterProfiles.get((data as ReportRow).created_by_user_id ?? "")?.display_name ?? null,
        commentSummaryByReportId.get(data.id),
        cleanupEventsByReportId.get(data.id) ?? null,
        cleanupSummaryByReportId.get(data.id),
        resolutionNotesByReportId.get(data.id) ?? null,
        campaignsByReportId.get(data.id) ?? null
      )
    );

    void notifyChatReportStatusChanged({
      reportId: data.id,
      source: currentReport.source,
      fromStatus: currentReport.status,
      toStatus: nextStatus,
      description: data.description,
      note: parsedBody.data.note ?? null
    }).catch((notificationError) => {
      console.error(
        "Failed to send chat status notification:",
        notificationError instanceof Error
          ? notificationError.message
          : notificationError
      );
    });

    if (nextStatus === "resolved") {
      void notifyCleanupParticipants({
        type: "cleanup_resolved",
        report: data as ReportRow,
        resolutionNote: parsedBody.data.note ?? null
      }).catch((notificationError) => {
        console.error(
          "Failed to send cleanup resolved notification:",
          notificationError instanceof Error
            ? notificationError.message
            : notificationError
        );
      });
    }
  } catch (mediaError) {
    res.status(500).json({
      error: "Status updated, but failed to fetch report media.",
      details:
        mediaError instanceof Error ? mediaError.message : "Unknown media error."
    });
  }
});

reportsRouter.patch("/:id/media/:mediaId/moderation", authGuard, async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsedParams = mediaIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid ids.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = moderateMediaSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const updatePayload = parsedBody.data.isHidden
    ? {
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_by_user_id: req.authUser!.id,
        hidden_reason: parsedBody.data.reason ?? null
      }
    : {
        is_hidden: false,
        hidden_at: null,
        hidden_by_user_id: null,
        hidden_reason: null
      };

  const { data, error } = await supabaseAdmin
    .from("report_media")
    .update(updatePayload)
    .eq("id", parsedParams.data.mediaId)
    .eq("report_id", parsedParams.data.id)
    .select(
      "id, report_id, media_type, media_context, public_url, thumbnail_url, mime_type, size_bytes, width_px, height_px, duration_seconds, uploaded_by_user_id, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to moderate media.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: parsedBody.data.isHidden ? "media_hidden" : "media_unhidden",
    entityType: "report_media",
    entityId: parsedParams.data.mediaId,
    reportId: parsedParams.data.id,
    metadata: {
      mediaType: data.media_type,
      reason: parsedBody.data.reason ?? null
    }
  });

  res.json({
    id: data.id,
    mediaType: data.media_type,
    url: data.public_url,
    thumbnailUrl: data.thumbnail_url,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
    widthPx: data.width_px,
    heightPx: data.height_px,
    durationSeconds: data.duration_seconds,
    isHidden: data.is_hidden,
    hiddenAt: data.hidden_at,
    hiddenByUserId: data.hidden_by_user_id,
    hiddenReason: data.hidden_reason,
    createdAt: data.created_at
  });
});

reportsRouter.get("/:id/history", authGuard, async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("report_status_history")
    .select(
      "id, report_id, from_status, to_status, changed_by_user_id, note, created_at"
    )
    .eq("report_id", parsed.data.id)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({
      error: "Failed to fetch status history.",
      details: error.message
    });
    return;
  }

  try {
    const rows = (data ?? []) as ReportStatusHistoryRow[];
    const profileNames = await loadProfileNamesByIds(
      rows.map((item) => item.changed_by_user_id ?? "")
    );

    res.json({
      items: rows.map((item) =>
        toHistoryResponse(item, profileNames.get(item.changed_by_user_id ?? ""))
      )
    });
  } catch (historyError) {
    res.status(500).json({
      error: "Failed to enrich status history.",
      details:
        historyError instanceof Error ? historyError.message : "Unknown history error."
    });
  }
});

reportsRouter.get("/:id/comments", authGuard, async (req, res) => {
  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }
  if (!reportResult.data || !(await canAccessReport(req.authUser, reportResult.data as ReportRow))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  let query = supabaseAdmin
    .from("report_comments")
    .select(
      "id, report_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .eq("report_id", parsed.data.id)
    .order("created_at", { ascending: false });

  if (!requireModerator(req.authUser?.role)) {
    query = query.eq("visibility", "public").eq("is_hidden", false);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({
      error: "Failed to fetch comments.",
      details: error.message
    });
    return;
  }

  try {
    const rows = (data ?? []) as ReportCommentRow[];
    const profileNames = await loadProfileNamesByIds(
      rows.map((item) => item.author_user_id ?? "")
    );

    res.json({
      items: rows.map((item) =>
        toCommentResponse(item, profileNames.get(item.author_user_id ?? ""))
      )
    });
  } catch (commentError) {
    res.status(500).json({
      error: "Failed to enrich comments.",
      details:
        commentError instanceof Error ? commentError.message : "Unknown comment error."
    });
  }
});

reportsRouter.post("/:id/comments", authGuard, async (req, res) => {
  const parsedParams = reportIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = createCommentSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }
  if (!reportResult.data || !(await canAccessReport(req.authUser, reportResult.data as ReportRow))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  if ((reportResult.data as ReportRow).status === "resolved" && !requireModerator(req.authUser?.role)) {
    res.status(409).json({
      error: "Resolved reports are read-only for participants and authors."
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("report_comments")
    .insert({
      report_id: parsedParams.data.id,
      author_user_id: req.authUser!.id,
      visibility: requireModerator(req.authUser?.role)
        ? parsedBody.data.visibility
        : "public",
      message: parsedBody.data.message
    })
    .select(
      "id, report_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to create comment.",
      details: error.message
    });
    return;
  }

  try {
    const profileNames = await loadProfileNamesByIds([
      data.author_user_id ?? req.authUser!.id
    ]);

    res.status(201).json(
      toCommentResponse(
        data as ReportCommentRow,
        profileNames.get(data.author_user_id ?? req.authUser!.id)
      )
    );
  } catch (commentError) {
    res.status(500).json({
      error: "Comment created, but failed to enrich author.",
      details:
        commentError instanceof Error ? commentError.message : "Unknown comment error."
    });
  }
});

reportsRouter.get("/:id/cleanup-event", authGuard, async (req, res) => {
  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report || !(await canAccessReport(req.authUser, report))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  try {
    const cleanupEventsByReportId = await loadCleanupEventsByReportIds([report.id]);
    const cleanupEvent = cleanupEventsByReportId.get(report.id) ?? null;

    res.json({ item: cleanupEvent ? toCleanupEventResponse(cleanupEvent) : null });
  } catch (error) {
    const message =
      error instanceof Error && isMissingCleanupEventsTable(error.message)
        ? "Cleanup events table is missing. Run the cleanup events migration first."
        : error instanceof Error
          ? error.message
          : "Unknown cleanup event error.";

    res.status(500).json({
      error: message,
      details: message
    });
  }
});

reportsRouter.put("/:id/cleanup-event", authGuard, async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsedParams = reportIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = updateCleanupEventSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  if (report.status !== "planned_cleanup") {
    res.status(409).json({
      error: "Cleanup can be scheduled only in planned cleanup status."
    });
    return;
  }

  const payload = parsedBody.data;
  const existingCleanupEventsByReportId = await loadCleanupEventsByReportIds([report.id]);
  const existingCleanupEvent = existingCleanupEventsByReportId.get(report.id) ?? null;
  let resolvedMeetingCoordinates = null as {
    latitude: number;
    longitude: number;
  } | null;

  if (payload.meetingLatitude !== null && payload.meetingLatitude !== undefined) {
    resolvedMeetingCoordinates = {
      latitude: payload.meetingLatitude,
      longitude: payload.meetingLongitude as number
    };
  } else {
    resolvedMeetingCoordinates = await resolveCoordinatesFromInput(payload.meetingAddress);
    if (!resolvedMeetingCoordinates) {
      res.status(400).json({
        error: "Could not resolve meeting coordinates from the provided address or link."
      });
      return;
    }
  }

  const upsertPayload = {
    report_id: report.id,
    scheduled_at: payload.scheduledAt,
    meeting_address: payload.meetingAddress.trim(),
    meeting_latitude: resolvedMeetingCoordinates.latitude,
    meeting_longitude: resolvedMeetingCoordinates.longitude,
    instructions_text: payload.instructionsText.trim(),
    tools_note: payload.toolsNote?.trim() || null,
    created_by_user_id: req.authUser!.id,
    updated_by_user_id: req.authUser!.id
  };

  const { data, error } = await supabaseAdmin
    .from("cleanup_events")
    .upsert(upsertPayload, {
      onConflict: "report_id"
    })
    .select(
      "id, report_id, scheduled_at, meeting_address, meeting_latitude, meeting_longitude, instructions_text, tools_note, created_by_user_id, updated_by_user_id, created_at, updated_at"
    )
    .single();

  if (error) {
    const message = isMissingCleanupEventsTable(error.message)
      ? "Cleanup events table is missing. Run the cleanup events migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "cleanup_event_upserted",
    entityType: "cleanup_event",
    entityId: (data as CleanupEventRow).id,
    reportId: report.id,
    metadata: {
      scheduledAt: payload.scheduledAt,
      meetingAddress: payload.meetingAddress.trim()
    }
  });

  void notifyCleanupParticipants({
    type: existingCleanupEvent ? "cleanup_event_updated" : "cleanup_event_scheduled",
    report,
    cleanupEvent: data as CleanupEventRow
  }).catch((notificationError) => {
    console.error(
      "Failed to notify cleanup participants:",
      notificationError instanceof Error
        ? notificationError.message
        : notificationError
    );
  });

  res.json(toCleanupEventResponse(data as CleanupEventRow));
});

reportsRouter.get("/:id/cleanup-participants", authGuard, async (req, res) => {
  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report || !(await canAccessReport(req.authUser, report))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  try {
    const items =
      report.status === "planned_cleanup"
        ? await loadCleanupParticipantsByReportId(report.id)
        : [];

    res.json({ items });
  } catch (error) {
    const message =
      error instanceof Error &&
      isMissingCleanupParticipantsTable(error.message)
        ? "Cleanup participants table is missing. Run the cleanup participants migration first."
        : error instanceof Error
          ? error.message
          : "Unknown cleanup error.";

    res.status(500).json({
      error: message,
      details: message
    });
  }
});

reportsRouter.post("/:id/cleanup-participants", authGuard, async (req, res) => {
  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report || !(await canAccessReport(req.authUser, report))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }
  if (report.status !== "planned_cleanup") {
    res.status(409).json({
      error: "Cleanup signups are available only in planned cleanup status."
    });
    return;
  }

  const { error } = await supabaseAdmin
    .from("report_cleanup_participants")
    .upsert(
      {
        report_id: report.id,
        user_id: req.authUser!.id
      },
      {
        onConflict: "report_id,user_id",
        ignoreDuplicates: true
      }
    );

  if (error) {
    const message = isMissingCleanupParticipantsTable(error.message)
      ? "Cleanup participants table is missing. Run the cleanup participants migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  try {
    const items = await loadCleanupParticipantsByReportId(report.id);
    res.status(201).json({ items });
  } catch (participantError) {
    const message =
      participantError instanceof Error &&
      isMissingCleanupParticipantsTable(participantError.message)
        ? "Cleanup participants table is missing. Run the cleanup participants migration first."
        : participantError instanceof Error
          ? participantError.message
          : "Unknown cleanup error.";

    res.status(500).json({
      error: "Joined cleanup, but failed to load participants.",
      details: message
    });
  }
});

reportsRouter.delete("/:id/cleanup-participants/me", authGuard, async (req, res) => {
  const parsed = reportIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid report id.",
      details: parsed.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report || !(await canAccessReport(req.authUser, report))) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  const { error } = await supabaseAdmin
    .from("report_cleanup_participants")
    .delete()
    .eq("report_id", report.id)
    .eq("user_id", req.authUser!.id);

  if (error) {
    const message = isMissingCleanupParticipantsTable(error.message)
      ? "Cleanup participants table is missing. Run the cleanup participants migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  try {
    const items =
      report.status === "planned_cleanup"
        ? await loadCleanupParticipantsByReportId(report.id)
        : [];
    res.json({ items });
  } catch (participantError) {
    const message =
      participantError instanceof Error &&
      isMissingCleanupParticipantsTable(participantError.message)
        ? "Cleanup participants table is missing. Run the cleanup participants migration first."
        : participantError instanceof Error
          ? participantError.message
          : "Unknown cleanup error.";

    res.status(500).json({
      error: "Left cleanup, but failed to load participants.",
      details: message
    });
  }
});

reportsRouter.delete("/:id/cleanup-participants/:userId", authGuard, async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsed = cleanupParticipantIdSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid ids.",
      details: parsed.error.flatten()
    });
    return;
  }

  const reportResult = await supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, created_at, updated_at, published_at"
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (reportResult.error) {
    res.status(500).json({
      error: "Failed to load report.",
      details: reportResult.error.message
    });
    return;
  }

  const report = reportResult.data as ReportRow | null;
  if (!report) {
    res.status(404).json({ error: "Report not found." });
    return;
  }

  const { error } = await supabaseAdmin
    .from("report_cleanup_participants")
    .delete()
    .eq("report_id", parsed.data.id)
    .eq("user_id", parsed.data.userId);

  if (error) {
    const message = isMissingCleanupParticipantsTable(error.message)
      ? "Cleanup participants table is missing. Run the cleanup participants migration first."
      : error.message;

    res.status(500).json({
      error: message,
      details: message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "cleanup_participant_removed",
    entityType: "report_cleanup_participant",
    reportId: parsed.data.id,
    targetUserId: parsed.data.userId,
    metadata: {}
  });

  try {
    const items =
      report.status === "planned_cleanup"
        ? await loadCleanupParticipantsByReportId(report.id)
        : [];
    res.json({ items });
  } catch (participantError) {
    const message =
      participantError instanceof Error &&
      isMissingCleanupParticipantsTable(participantError.message)
        ? "Cleanup participants table is missing. Run the cleanup participants migration first."
        : participantError instanceof Error
          ? participantError.message
          : "Unknown cleanup error.";

    res.status(500).json({
      error: "Participant removed, but failed to load participants.",
      details: message
    });
  }
});

reportsRouter.patch("/:id/comments/:commentId/moderation", authGuard, async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsedParams = commentIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid ids.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = moderateCommentSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const existing = await supabaseAdmin
    .from("report_comments")
    .select(
      "id, report_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .eq("id", parsedParams.data.commentId)
    .eq("report_id", parsedParams.data.id)
    .single();

  if (existing.error) {
    res.status(500).json({
      error: "Failed to load comment.",
      details: existing.error.message
    });
    return;
  }

  const updatePayload = parsedBody.data.isHidden
    ? {
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_by_user_id: req.authUser!.id,
        hidden_reason: parsedBody.data.reason ?? null
      }
    : {
        is_hidden: false,
        hidden_at: null,
        hidden_by_user_id: null,
        hidden_reason: null
      };

  const { data, error } = await supabaseAdmin
    .from("report_comments")
    .update(updatePayload)
    .eq("id", parsedParams.data.commentId)
    .eq("report_id", parsedParams.data.id)
    .select(
      "id, report_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to moderate comment.",
      details: error.message
    });
    return;
  }

  try {
    const profileNames = await loadProfileNamesByIds([
      data.author_user_id ?? "",
      data.hidden_by_user_id ?? ""
    ]);

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: parsedBody.data.isHidden ? "comment_hidden" : "comment_unhidden",
      entityType: "report_comment",
      entityId: parsedParams.data.commentId,
      reportId: parsedParams.data.id,
      metadata: {
        visibility: data.visibility,
        reason: parsedBody.data.reason ?? null
      }
    });

    res.json(
      toCommentResponse(
        data as ReportCommentRow,
        profileNames.get(data.author_user_id ?? "")
      )
    );
  } catch (commentError) {
    res.status(500).json({
      error: "Comment moderated, but failed to enrich author.",
      details:
        commentError instanceof Error ? commentError.message : "Unknown comment error."
    });
  }
});
