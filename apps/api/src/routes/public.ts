import { Router } from "express";
import { z } from "zod";
import {
  loadCleanupEventsByReportIds,
  loadMediaByReportIds,
  loadResolutionNotesByReportIds
} from "../lib/reportService";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const querySchema = z.object({
  period: z.enum(["all", "year", "season"]).default("all"),
  campaignId: z.string().uuid().optional()
});
const mapQuerySchema = querySchema.extend({
  metric: z.enum(["total", "active", "in_review", "planned_cleanup", "resolved", "rejected"])
});

type ReportStatus = "new" | "in_review" | "planned_cleanup" | "resolved" | "rejected";

type ReportRow = {
  id: string;
  created_by_user_id: string | null;
  status: ReportStatus;
  source: "mobile" | "web" | "chat";
  title: string | null;
  description: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  created_at: string;
  published_at: string;
};

type CleanupParticipantRow = {
  report_id: string;
  user_id: string;
  joined_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: "draft" | "active" | "completed";
};

type PublicMapMetric =
  | "total"
  | "active"
  | "in_review"
  | "planned_cleanup"
  | "resolved"
  | "rejected";

const MAP_COLORS: Record<PublicMapMetric, string> = {
  total: "#0f766e",
  active: "#2563eb",
  in_review: "#f59e0b",
  planned_cleanup: "#7c3aed",
  resolved: "#16a34a",
  rejected: "#dc2626"
};

function getPeriodStart(period: "all" | "year" | "season") {
  if (period === "all") {
    return null;
  }

  const date = new Date();
  if (period === "year") {
    date.setFullYear(date.getFullYear() - 1);
    return date;
  }

  date.setMonth(date.getMonth() - 3);
  return date;
}

function getPeriodLabel(period: "all" | "year" | "season") {
  switch (period) {
    case "year":
      return "year";
    case "season":
      return "season";
    case "all":
    default:
      return "all";
  }
}

function getCampaignLabel(campaign: CampaignRow | null) {
  if (!campaign) {
    return null;
  }

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    status: campaign.status
  };
}

function formatMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${month}.${year}`;
}

function escapeCsvCell(value: string | number | null | undefined) {
  const stringValue = value == null ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

function toPublicMedia(item: {
  id: string;
  media_type: "image" | "video";
  media_context?: "report" | "cleanup_evidence";
  public_url: string;
  thumbnail_url: string | null;
  mime_type: string;
  size_bytes: number;
  width_px: number | null;
  height_px: number | null;
  duration_seconds: number | null;
  created_at: string;
}) {
  return {
    id: item.id,
    mediaType: item.media_type,
    mediaContext: item.media_context ?? "report",
    url: item.public_url,
    thumbnailUrl: item.thumbnail_url,
    mimeType: item.mime_type,
    sizeBytes: item.size_bytes,
    widthPx: item.width_px,
    heightPx: item.height_px,
    durationSeconds: item.duration_seconds,
    createdAt: item.created_at
  };
}

function toPublicCleanupEvent(item: {
  id: string;
  scheduled_at: string;
  meeting_address: string;
  meeting_latitude: number | null;
  meeting_longitude: number | null;
  instructions_text: string;
  tools_note: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: item.id,
    scheduledAt: item.scheduled_at,
    meetingAddress: item.meeting_address,
    meetingLocation:
      item.meeting_latitude !== null && item.meeting_longitude !== null
        ? {
            latitude: item.meeting_latitude,
            longitude: item.meeting_longitude
          }
        : null,
    instructionsText: item.instructions_text,
    toolsNote: item.tools_note,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

function buildCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
}

function filterReportsForMetric(reports: ReportRow[], metric: PublicMapMetric) {
  switch (metric) {
    case "active":
      return reports.filter(
        (item) => item.status === "in_review" || item.status === "planned_cleanup"
      );
    case "in_review":
      return reports.filter((item) => item.status === "in_review");
    case "planned_cleanup":
      return reports.filter((item) => item.status === "planned_cleanup");
    case "resolved":
      return reports.filter((item) => item.status === "resolved");
    case "rejected":
      return reports.filter((item) => item.status === "rejected");
    case "total":
    default:
      return reports.filter((item) => item.status !== "new");
  }
}

async function loadReportsForPeriod(start: Date | null) {
  let query = supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, published_at, created_at"
    )
    .order("created_at", { ascending: true });

  if (start) {
    query = query.gte("created_at", start.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ReportRow[];
}

async function loadReportsForRange(start: Date | null, end: Date | null) {
  let query = supabaseAdmin
    .from("reports")
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, published_at, created_at"
    )
    .order("created_at", { ascending: true });

  if (start) {
    query = query.gte("created_at", start.toISOString());
  }

  if (end) {
    query = query.lte("created_at", end.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ReportRow[];
}

async function loadCampaignById(campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, name, description, starts_at, ends_at, status")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CampaignRow | null) ?? null;
}

async function loadReportIdsForCampaign(campaignId: string) {
  const { data, error } = await supabaseAdmin
    .from("report_campaigns")
    .select("report_id")
    .eq("campaign_id", campaignId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{ report_id: string }>).map((item) => item.report_id);
}

async function loadCleanupParticipantsForReportIds(reportIds: string[]) {
  if (reportIds.length === 0) {
    return [] as CleanupParticipantRow[];
  }

  const { data, error } = await supabaseAdmin
    .from("report_cleanup_participants")
    .select("report_id, user_id, joined_at")
    .in("report_id", reportIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CleanupParticipantRow[];
}

async function loadProfiles(userIds: string[]) {
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

function buildMonthRange(start: Date, end: Date) {
  const items: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor.getTime() <= limit.getTime()) {
    items.push(formatMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return items;
}

async function resolveReportWindow(query: { period: "all" | "year" | "season"; campaignId?: string }) {
  if (query.campaignId) {
    const campaign = await loadCampaignById(query.campaignId);
    if (!campaign) {
      const error = new Error("Campaign not found.");
      error.name = "CampaignNotFound";
      throw error;
    }

    const reportIds = await loadReportIdsForCampaign(campaign.id);
    const reports =
      reportIds.length === 0
        ? ([] as ReportRow[])
        : await (async () => {
            const { data, error } = await supabaseAdmin
              .from("reports")
              .select(
                "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, published_at, created_at"
              )
              .in("id", reportIds)
              .order("created_at", { ascending: true });

            if (error) {
              throw new Error(error.message);
            }

            return (data ?? []) as ReportRow[];
          })();

    return {
      campaign,
      start: new Date(campaign.starts_at),
      end: new Date(campaign.ends_at),
      reports,
      periodLabel: getPeriodLabel(query.period)
    };
  }

  const start = getPeriodStart(query.period);
  return {
    campaign: null,
    start,
    end: new Date(),
    reports: await loadReportsForPeriod(start),
    periodLabel: getPeriodLabel(query.period)
  };
}

async function buildActivityPayload(query: { period: "all" | "year" | "season"; campaignId?: string }) {
  const { reports, start, end, periodLabel, campaign } = await resolveReportWindow(query);
  const reportIds = reports.map((item) => item.id);
  const cleanupParticipants = await loadCleanupParticipantsForReportIds(reportIds);

  const monthCounts = new Map<
    string,
    {
      reports: number;
      resolved: number;
      cleanups: number;
    }
  >();

  const rangeStart = start ?? new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1);
  const rangeEnd = end ?? new Date();
  const monthKeys = buildMonthRange(rangeStart, rangeEnd);

  for (const key of monthKeys) {
    monthCounts.set(key, { reports: 0, resolved: 0, cleanups: 0 });
  }

  const reportById = new Map(reports.map((item) => [item.id, item]));
  for (const report of reports) {
    const key = formatMonthKey(new Date(report.created_at));
    const bucket = monthCounts.get(key);
    if (!bucket) {
      continue;
    }

    bucket.reports += 1;
    if (report.status === "resolved") {
      bucket.resolved += 1;
    }
  }

  for (const participant of cleanupParticipants) {
    const key = formatMonthKey(new Date(participant.joined_at));
    const bucket = monthCounts.get(key);
    if (!bucket) {
      continue;
    }

    bucket.cleanups += 1;
  }

  const participantStats = new Map<
    string,
    { cleanupCount: number; resolvedCount: number }
  >();
  for (const participant of cleanupParticipants) {
    const current = participantStats.get(participant.user_id) ?? {
      cleanupCount: 0,
      resolvedCount: 0
    };
    current.cleanupCount += 1;

    const report = reportById.get(participant.report_id);
    if (report?.status === "resolved") {
      current.resolvedCount += 1;
    }

    participantStats.set(participant.user_id, current);
  }

  const authorStats = new Map<
    string,
    { reportCount: number; resolvedCount: number }
  >();
  for (const report of reports) {
    if (!report.created_by_user_id) {
      continue;
    }

    const current = authorStats.get(report.created_by_user_id) ?? {
      reportCount: 0,
      resolvedCount: 0
    };
    current.reportCount += 1;
    if (report.status === "resolved") {
      current.resolvedCount += 1;
    }

    authorStats.set(report.created_by_user_id, current);
  }

  const profileNames = await loadProfiles([
    ...participantStats.keys(),
    ...authorStats.keys()
  ]);

  return {
    period: periodLabel,
    campaign: getCampaignLabel(campaign),
    generatedAt: new Date().toISOString(),
    monthly: monthKeys.map((key) => ({
      key,
      label: formatMonthLabel(key),
      reports: monthCounts.get(key)?.reports ?? 0,
      resolved: monthCounts.get(key)?.resolved ?? 0,
      cleanups: monthCounts.get(key)?.cleanups ?? 0
    })),
    topParticipants: [...participantStats.entries()]
      .map(([userId, stats]) => ({
        userId,
        displayName: profileNames.get(userId) ?? null,
        cleanupCount: stats.cleanupCount,
        resolvedCount: stats.resolvedCount
      }))
      .sort((left, right) => {
        if (right.cleanupCount !== left.cleanupCount) {
          return right.cleanupCount - left.cleanupCount;
        }

        return right.resolvedCount - left.resolvedCount;
      })
      .slice(0, 10),
    topReporters: [...authorStats.entries()]
      .map(([userId, stats]) => ({
        userId,
        displayName: profileNames.get(userId) ?? null,
        reportCount: stats.reportCount,
        resolvedCount: stats.resolvedCount
      }))
      .sort((left, right) => {
        if (right.reportCount !== left.reportCount) {
          return right.reportCount - left.reportCount;
        }

        return right.resolvedCount - left.resolvedCount;
      })
      .slice(0, 10)
  };
}

export const publicRouter = Router();

publicRouter.get("/stats", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query params.",
      details: parsed.error.flatten()
    });
    return;
  }

  try {
    const { reports, periodLabel, campaign } = await resolveReportWindow(parsed.data);

    const counts = {
      total: reports.length,
      new: reports.filter((item) => item.status === "new").length,
      inReview: reports.filter((item) => item.status === "in_review").length,
      plannedCleanup: reports.filter((item) => item.status === "planned_cleanup").length,
      resolved: reports.filter((item) => item.status === "resolved").length,
      rejected: reports.filter((item) => item.status === "rejected").length
    };

    res.json({
      period: periodLabel,
      campaign: getCampaignLabel(campaign),
      generatedAt: new Date().toISOString(),
      counts: {
        ...counts,
        active: counts.new + counts.inReview + counts.plannedCleanup
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === "CampaignNotFound") {
      res.status(404).json({
        error: "Campaign not found."
      });
      return;
    }

    res.status(500).json({
      error: "Failed to load public stats.",
      details: error instanceof Error ? error.message : "Unknown public stats error."
    });
  }
});

publicRouter.get("/activity", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query params.",
      details: parsed.error.flatten()
    });
    return;
  }

  try {
    res.json(await buildActivityPayload(parsed.data));
  } catch (error) {
    if (error instanceof Error && error.name === "CampaignNotFound") {
      res.status(404).json({
        error: "Campaign not found."
      });
      return;
    }

    res.status(500).json({
      error: "Failed to load public activity.",
      details: error instanceof Error ? error.message : "Unknown public activity error."
    });
  }
});

publicRouter.get("/export.csv", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).type("text/plain").send("Invalid query params.");
    return;
  }

  try {
    const statsPayloadPromise = (async () => {
      const { reports, periodLabel, campaign } = await resolveReportWindow(parsed.data);
      const counts = {
        total: reports.length,
        new: reports.filter((item) => item.status === "new").length,
        inReview: reports.filter((item) => item.status === "in_review").length,
        plannedCleanup: reports.filter((item) => item.status === "planned_cleanup").length,
        resolved: reports.filter((item) => item.status === "resolved").length,
        rejected: reports.filter((item) => item.status === "rejected").length
      };

      return {
        period: periodLabel,
        campaign: getCampaignLabel(campaign),
        generatedAt: new Date().toISOString(),
        counts: {
          ...counts,
          active: counts.new + counts.inReview + counts.plannedCleanup
        }
      };
    })();

    const [statsPayload, activityPayload] = await Promise.all([
      statsPayloadPromise,
      buildActivityPayload(parsed.data)
    ]);

    const rows: Array<Array<string | number | null | undefined>> = [
      ["Clean Sea public report export"],
      ["Generated at", statsPayload.generatedAt],
      ["Period", statsPayload.period],
      ["Campaign", statsPayload.campaign?.name ?? "All campaigns"],
      ["Campaign status", statsPayload.campaign?.status ?? ""],
      ["Campaign start", statsPayload.campaign?.startsAt ?? ""],
      ["Campaign end", statsPayload.campaign?.endsAt ?? ""],
      [],
      ["Summary"],
      ["Metric", "Value"],
      ["Submitted reports", statsPayload.counts.total],
      ["Active reports", statsPayload.counts.active],
      ["New", statsPayload.counts.new],
      ["In review", statsPayload.counts.inReview],
      ["Planned cleanup", statsPayload.counts.plannedCleanup],
      ["Resolved", statsPayload.counts.resolved],
      ["Rejected", statsPayload.counts.rejected],
      [],
      ["Monthly activity"],
      ["Month", "Reports", "Resolved", "Cleanup signups"]
    ];

    for (const item of activityPayload.monthly) {
      rows.push([item.label, item.reports, item.resolved, item.cleanups]);
    }

    rows.push([]);
    rows.push(["Top participants"]);
    rows.push(["Participant", "Cleanup signups", "Resolved cleanups"]);

    for (const item of activityPayload.topParticipants) {
      rows.push([item.displayName ?? "Unknown user", item.cleanupCount, item.resolvedCount]);
    }

    rows.push([]);
    rows.push(["Top reporters"]);
    rows.push(["Reporter", "Submitted reports", "Resolved reports"]);

    for (const item of activityPayload.topReporters) {
      rows.push([item.displayName ?? "Unknown user", item.reportCount, item.resolvedCount]);
    }

    const filenameParts = ["clean-sea-report", statsPayload.period];
    if (statsPayload.campaign?.name) {
      filenameParts.push(statsPayload.campaign.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-"));
    }

    const filename = `${filenameParts.filter(Boolean).join("-")}.csv`;

    res
      .status(200)
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
      .send(`\uFEFF${buildCsv(rows)}`);
  } catch (error) {
    if (error instanceof Error && error.name === "CampaignNotFound") {
      res.status(404).type("text/plain").send("Campaign not found.");
      return;
    }

    res
      .status(500)
      .type("text/plain")
      .send(error instanceof Error ? error.message : "Failed to export public report.");
  }
});

publicRouter.get("/map", async (req, res) => {
  const parsed = mapQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query params.",
      details: parsed.error.flatten()
    });
    return;
  }

  try {
    const { reports, periodLabel, campaign } = await resolveReportWindow(parsed.data);
    const visibleReports = filterReportsForMetric(reports, parsed.data.metric);
    const excludedPrivate =
      parsed.data.metric === "total" || parsed.data.metric === "active"
        ? reports.filter((item) => item.status === "new").length
        : 0;
    const reportIds = visibleReports.map((item) => item.id);
    const [mediaMap, cleanupEventsMap, resolutionNotesMap] = await Promise.all([
      loadMediaByReportIds(reportIds),
      loadCleanupEventsByReportIds(reportIds),
      loadResolutionNotesByReportIds(reportIds)
    ]);

    res.json({
      period: periodLabel,
      campaign: getCampaignLabel(campaign),
      generatedAt: new Date().toISOString(),
      metric: parsed.data.metric,
      color: MAP_COLORS[parsed.data.metric],
      counts: {
        matching:
          parsed.data.metric === "active"
            ? reports.filter(
                (item) =>
                  item.status === "new" ||
                  item.status === "in_review" ||
                  item.status === "planned_cleanup"
              ).length
            : parsed.data.metric === "total"
              ? reports.length
              : visibleReports.length,
        mapped: visibleReports.length,
        excludedPrivate
      },
      items: visibleReports.map((report) => ({
        id: report.id,
        status: report.status,
        title: report.title,
        description: report.description,
        location: {
          latitude: report.latitude,
          longitude: report.longitude,
          accuracyMeters: report.accuracy_meters ?? undefined
        },
        media: (mediaMap.get(report.id) ?? []).map((item) => toPublicMedia(item)),
        cleanupEvent: cleanupEventsMap.get(report.id)
          ? toPublicCleanupEvent(cleanupEventsMap.get(report.id)!)
          : null,
        resolutionNote: resolutionNotesMap.get(report.id) ?? {
          note: null,
          createdAt: null
        },
        createdAt: report.created_at,
        publishedAt: report.published_at
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.name === "CampaignNotFound") {
      res.status(404).json({
        error: "Campaign not found."
      });
      return;
    }

    res.status(500).json({
      error: "Failed to load public map.",
      details: error instanceof Error ? error.message : "Unknown public map error."
    });
  }
});
