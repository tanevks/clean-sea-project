import { Router } from "express";
import { z } from "zod";
import {
  loadCampaignsByReportIds,
  loadCleanupEventsByReportIds,
  loadCleanupSummaryByReportIds,
  loadMediaByReportIds,
  loadPublicCommentSummaryByReportIds,
  loadReporterProfilesByIds,
  loadResolutionNotesByReportIds,
  toReportResponse,
  type ReportRow
} from "../lib/reportService";
import { authGuard } from "../middleware/authGuard";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const updateProfileSchema = z.object({
  displayName: z.string().max(120).optional(),
  nickname: z.string().max(120).optional(),
  avatarUrl: z.string().url().optional(),
  phone: z.string().max(40).optional(),
  contactPhone: z.string().max(40).optional()
});

export const authRouter = Router();

authRouter.get("/dashboard", authGuard, async (req, res) => {
  const userId = req.authUser!.id;

  try {
    const myReportsResult = await supabaseAdmin
      .from("reports")
      .select(
        "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, published_at, created_at, updated_at"
      )
      .eq("created_by_user_id", userId)
      .order("created_at", { ascending: false });

    if (myReportsResult.error) {
      throw new Error(myReportsResult.error.message);
    }

    const cleanupParticipantsResult = await supabaseAdmin
      .from("report_cleanup_participants")
      .select("report_id, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });

    if (cleanupParticipantsResult.error) {
      throw new Error(cleanupParticipantsResult.error.message);
    }

    const myReports = (myReportsResult.data ?? []) as ReportRow[];
    const cleanupParticipations = (cleanupParticipantsResult.data ?? []) as Array<{
      report_id: string;
      joined_at: string;
    }>;

    const cleanupReportIds = [...new Set(cleanupParticipations.map((item) => item.report_id))];
    const cleanupReportsResult =
      cleanupReportIds.length > 0
        ? await supabaseAdmin
            .from("reports")
            .select(
              "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, published_at, created_at, updated_at"
            )
            .in("id", cleanupReportIds)
            .order("created_at", { ascending: false })
        : { data: [], error: null };

    if (cleanupReportsResult.error) {
      throw new Error(cleanupReportsResult.error.message);
    }

    const cleanupReports = (cleanupReportsResult.data ?? []) as ReportRow[];
    const allReports = [...myReports, ...cleanupReports.filter((item) => !myReports.some((own) => own.id === item.id))];
    const allReportIds = allReports.map((item) => item.id);
    const authorIds = allReports
      .map((item) => item.created_by_user_id)
      .filter((value): value is string => Boolean(value));

    const [
      campaignsByReportId,
      mediaByReportId,
      commentSummaryByReportId,
      cleanupEventsByReportId,
      cleanupSummaryByReportId,
      resolutionNotesByReportId,
      reporterProfilesById
    ] = await Promise.all([
      loadCampaignsByReportIds(allReportIds),
      loadMediaByReportIds(allReportIds),
      loadPublicCommentSummaryByReportIds(allReportIds),
      loadCleanupEventsByReportIds(allReportIds),
      loadCleanupSummaryByReportIds(allReportIds),
      loadResolutionNotesByReportIds(allReportIds),
      loadReporterProfilesByIds(authorIds)
    ]);

    const toSummary = (report: ReportRow) =>
      toReportResponse(
        report,
        mediaByReportId.get(report.id) ?? [],
        report.created_by_user_id
          ? reporterProfilesById.get(report.created_by_user_id)?.display_name ?? null
          : null,
        commentSummaryByReportId.get(report.id),
        cleanupEventsByReportId.get(report.id) ?? null,
        cleanupSummaryByReportId.get(report.id),
        resolutionNotesByReportId.get(report.id) ?? null,
        campaignsByReportId.get(report.id) ?? null
      );

    const myReportItems = myReports.map(toSummary);
    const cleanupReportById = new Map(cleanupReports.map((item) => [item.id, item]));
    const myCleanupItems = cleanupParticipations
      .map((item) => {
        const report = cleanupReportById.get(item.report_id);
        if (!report) {
          return null;
        }

        return {
          joinedAt: item.joined_at,
          report: toSummary(report)
        };
      })
      .filter((item): item is { joinedAt: string; report: ReturnType<typeof toSummary> } => Boolean(item));

    const now = Date.now();
    const stats = {
      reportCount: myReportItems.length,
      activeReportCount: myReportItems.filter((item) =>
        item.status === "new" || item.status === "in_review" || item.status === "planned_cleanup"
      ).length,
      resolvedReportCount: myReportItems.filter((item) => item.status === "resolved").length,
      cleanupJoinCount: myCleanupItems.length,
      cleanupResolvedCount: myCleanupItems.filter((item) => item.report.status === "resolved").length,
      upcomingCleanupCount: myCleanupItems.filter((item) => {
        const scheduledAt = item.report.cleanupEvent?.scheduledAt;
        return scheduledAt ? new Date(scheduledAt).getTime() >= now : false;
      }).length
    };

    res.json({
      generatedAt: new Date().toISOString(),
      myReports: myReportItems,
      myCleanups: myCleanupItems,
      stats
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load private dashboard.",
      details: error instanceof Error ? error.message : "Unknown dashboard error."
    });
  }
});

authRouter.get("/me", authGuard, async (req, res) => {
  const userId = req.authUser!.id;

  let { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role, display_name, avatar_url, phone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    res.status(500).json({
      error: "Failed to fetch profile.",
      details: error.message
    });
    return;
  }

  if (!data) {
    const fallbackDisplayName = req.authUser!.email?.split("@")[0] ?? "user";

    const inserted = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        role: req.authUser!.role,
        display_name: fallbackDisplayName
      })
      .select("id, role, display_name, avatar_url, phone")
      .single();

    if (inserted.error) {
      res.status(500).json({
        error: "Failed to create missing profile.",
        details: inserted.error.message
      });
      return;
    }

    data = inserted.data;
  }

  res.json({
    id: data.id,
    email: req.authUser!.email,
    role: data.role,
    displayName: data.display_name,
    nickname: data.display_name,
    avatarUrl: data.avatar_url,
    phone: data.phone,
    contactPhone: data.phone
  });
});

authRouter.patch("/me", authGuard, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  const updatePayload: Record<string, string> = {};
  if (parsed.data.displayName !== undefined) {
    updatePayload.display_name = parsed.data.displayName;
  }
  if (parsed.data.nickname !== undefined) {
    updatePayload.display_name = parsed.data.nickname;
  }
  if (parsed.data.avatarUrl !== undefined) {
    updatePayload.avatar_url = parsed.data.avatarUrl;
  }
  if (parsed.data.phone !== undefined) {
    updatePayload.phone = parsed.data.phone;
  }
  if (parsed.data.contactPhone !== undefined) {
    updatePayload.phone = parsed.data.contactPhone;
  }
  if (Object.keys(updatePayload).length === 0) {
    res.status(400).json({ error: "At least one field must be provided." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(updatePayload)
    .eq("id", req.authUser!.id)
    .select("id, role, display_name, avatar_url, phone")
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update profile.",
      details: error.message
    });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }

  res.json({
    id: data.id,
    email: req.authUser!.email,
    role: data.role,
    displayName: data.display_name,
    nickname: data.display_name,
    avatarUrl: data.avatar_url,
    phone: data.phone,
    contactPhone: data.phone
  });
});
