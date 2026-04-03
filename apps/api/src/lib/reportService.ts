import { supabaseAdmin } from "./supabaseAdmin";
import {
  getReportMediaPublicUrl,
  type CreateReportMedia
} from "./reportMedia";

export type ReportSource = "mobile" | "web" | "chat";
export type ReportStatus =
  | "new"
  | "in_review"
  | "planned_cleanup"
  | "resolved"
  | "rejected";

export type ReportRow = {
  id: string;
  created_by_user_id: string | null;
  status: ReportStatus;
  source: ReportSource;
  title: string | null;
  description: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  created_at: string;
  updated_at: string;
  published_at: string;
};

export type ReportMediaRow = {
  id: string;
  report_id: string;
  media_type: "image" | "video";
  media_context?: "report" | "cleanup_evidence";
  public_url: string;
  thumbnail_url: string | null;
  mime_type: string;
  size_bytes: number;
  width_px: number | null;
  height_px: number | null;
  duration_seconds: number | null;
  uploaded_by_user_id?: string | null;
  is_hidden?: boolean;
  hidden_at?: string | null;
  hidden_by_user_id?: string | null;
  hidden_reason?: string | null;
  created_at: string;
};

export type ReporterProfileRow = {
  id: string;
  display_name: string | null;
};

export type CleanupEventRow = {
  id: string;
  report_id: string;
  scheduled_at: string;
  meeting_address: string;
  meeting_latitude: number | null;
  meeting_longitude: number | null;
  instructions_text: string;
  tools_note: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportCommentSummary = {
  publicCommentCount: number;
  latestPublicCommentAt: string | null;
};

export type CleanupSummary = {
  participantCount: number;
  scheduledAt: string | null;
};

export type CampaignSummary = {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: "draft" | "active" | "completed";
};

export type ResolutionNote = {
  note: string | null;
  createdAt: string | null;
};

export type CreateReportInput = {
  createdByUserId?: string | null;
  source: ReportSource;
  title?: string | null;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  };
  media?: CreateReportMedia[];
};

export async function insertReportMedia(
  reportId: string,
  media: CreateReportMedia[],
  options?: {
    mediaContext?: "report" | "cleanup_evidence";
    uploadedByUserId?: string | null;
  }
) {
  if (media.length === 0) {
    return [] as ReportMediaRow[];
  }

  const mediaInsert = await supabaseAdmin
    .from("report_media")
    .insert(
      media.map((item) => ({
        report_id: reportId,
        media_type: item.mediaType,
        media_context: options?.mediaContext ?? "report",
        storage_key: item.storageKey,
        public_url: getReportMediaPublicUrl(item.storageKey),
        thumbnail_url: null,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
        duration_seconds: item.durationSeconds ?? null,
        width_px: item.widthPx ?? null,
        height_px: item.heightPx ?? null,
        uploaded_by_user_id: options?.uploadedByUserId ?? null
      }))
    )
    .select(
      "id, report_id, media_type, media_context, public_url, thumbnail_url, mime_type, size_bytes, width_px, height_px, duration_seconds, uploaded_by_user_id, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    );

  if (mediaInsert.error) {
    const message = isMissingReportMediaTable(mediaInsert.error.message)
      ? "report_media table is missing. Run the report media migration before uploading files."
      : mediaInsert.error.message;

    throw new Error(message);
  }

  return (mediaInsert.data ?? []) as ReportMediaRow[];
}

export function isMissingReportMediaTable(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("report_media") &&
    (normalized.includes("does not exist") || normalized.includes("not found"))
  );
}

export function isMissingCleanupParticipantsTable(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("report_cleanup_participants") &&
    (normalized.includes("does not exist") || normalized.includes("not found"))
  );
}

export function isMissingCleanupEventsTable(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("cleanup_events") &&
    (normalized.includes("does not exist") || normalized.includes("not found"))
  );
}

export function toMediaResponse(media: ReportMediaRow) {
  return {
    id: media.id,
    mediaType: media.media_type,
    mediaContext: media.media_context ?? "report",
    url: media.public_url,
    thumbnailUrl: media.thumbnail_url,
    mimeType: media.mime_type,
    sizeBytes: media.size_bytes,
    widthPx: media.width_px,
    heightPx: media.height_px,
    durationSeconds: media.duration_seconds,
    uploadedByUserId: media.uploaded_by_user_id ?? null,
    isHidden: media.is_hidden ?? false,
    hiddenAt: media.hidden_at ?? null,
    hiddenByUserId: media.hidden_by_user_id ?? null,
    hiddenReason: media.hidden_reason ?? null,
    createdAt: media.created_at
  };
}

export function toCleanupEventResponse(event: CleanupEventRow) {
  return {
    id: event.id,
    scheduledAt: event.scheduled_at,
    meetingAddress: event.meeting_address,
    meetingLocation:
      event.meeting_latitude !== null && event.meeting_longitude !== null
        ? {
            latitude: event.meeting_latitude,
            longitude: event.meeting_longitude
          }
        : null,
    instructionsText: event.instructions_text,
    toolsNote: event.tools_note,
    createdByUserId: event.created_by_user_id,
    updatedByUserId: event.updated_by_user_id,
    createdAt: event.created_at,
    updatedAt: event.updated_at
  };
}

function toCampaignSummary(item: {
  id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: "draft" | "active" | "completed";
}): CampaignSummary {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    status: item.status
  };
}

export function toReportResponse(
  report: ReportRow,
  media: ReportMediaRow[] = [],
  reporterDisplayName?: string | null,
  commentSummary?: ReportCommentSummary,
  cleanupEvent?: CleanupEventRow | null,
  cleanupSummary?: CleanupSummary,
  resolutionNote?: ResolutionNote | null,
  campaign?: CampaignSummary | null
) {
  return {
    id: report.id,
    status: report.status,
    source: report.source,
    title: report.title,
    description: report.description,
    location: {
      latitude: report.latitude,
      longitude: report.longitude,
      accuracyMeters: report.accuracy_meters ?? undefined
    },
    media: media.map(toMediaResponse),
    createdBy: {
      userId: report.created_by_user_id,
      displayName: reporterDisplayName ?? null
    },
    commentSummary: commentSummary ?? {
      publicCommentCount: 0,
      latestPublicCommentAt: null
    },
    cleanupEvent: cleanupEvent ? toCleanupEventResponse(cleanupEvent) : null,
    cleanupSummary: cleanupSummary ?? {
      participantCount: 0,
      scheduledAt: cleanupEvent?.scheduled_at ?? null
    },
    campaign: campaign ?? null,
    resolutionNote: resolutionNote ?? {
      note: null,
      createdAt: null
    },
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    publishedAt: report.published_at
  };
}

export async function loadCampaignsByReportIds(reportIds: string[]) {
  if (reportIds.length === 0) {
    return new Map<string, CampaignSummary>();
  }

  const { data, error } = await supabaseAdmin
    .from("report_campaigns")
    .select(
      "report_id, campaigns(id, name, description, starts_at, ends_at, status)"
    )
    .in("report_id", reportIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []) as Array<{
    report_id: string;
    campaigns:
      | Array<{
          id: string;
          name: string;
          description: string | null;
          starts_at: string;
          ends_at: string;
          status: "draft" | "active" | "completed";
        }>
      | {
          id: string;
          name: string;
          description: string | null;
          starts_at: string;
          ends_at: string;
          status: "draft" | "active" | "completed";
        }
      | null;
  }>;

  return new Map(
    items
      .map((item) => {
        const campaign = Array.isArray(item.campaigns)
          ? item.campaigns[0] ?? null
          : item.campaigns;
        return campaign ? [item.report_id, toCampaignSummary(campaign)] : null;
      })
      .filter((item): item is [string, CampaignSummary] => Boolean(item))
  );
}

export async function loadResolutionNotesByReportIds(reportIds: string[]) {
  if (reportIds.length === 0) {
    return new Map<string, ResolutionNote>();
  }

  const { data, error } = await supabaseAdmin
    .from("report_status_history")
    .select("report_id, note, created_at")
    .in("report_id", reportIds)
    .eq("to_status", "resolved")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const items = (data ?? []) as Array<{
    report_id: string;
    note: string | null;
    created_at: string | null;
  }>;

  const result = new Map<string, ResolutionNote>();
  for (const item of items) {
    if (!result.has(item.report_id)) {
      result.set(item.report_id, {
        note: item.note ?? null,
        createdAt: item.created_at ?? null
      });
    }
  }

  return result;
}

export async function loadCleanupSummaryByReportIds(reportIds: string[]) {
  if (reportIds.length === 0) {
    return new Map<string, CleanupSummary>();
  }

  const participantSummary = new Map<string, CleanupSummary>();

  const participantsResult = await supabaseAdmin
    .from("report_cleanup_participants")
    .select("report_id")
    .in("report_id", reportIds);

  if (participantsResult.error) {
    if (!isMissingCleanupParticipantsTable(participantsResult.error.message)) {
      throw new Error(participantsResult.error.message);
    }
  } else {
    for (const item of (participantsResult.data ?? []) as Array<{ report_id: string }>) {
      const current = participantSummary.get(item.report_id) ?? {
        participantCount: 0,
        scheduledAt: null
      };
      current.participantCount += 1;
      participantSummary.set(item.report_id, current);
    }
  }

  const cleanupEventsResult = await supabaseAdmin
    .from("cleanup_events")
    .select("report_id, scheduled_at")
    .in("report_id", reportIds);

  if (cleanupEventsResult.error) {
    if (!isMissingCleanupEventsTable(cleanupEventsResult.error.message)) {
      throw new Error(cleanupEventsResult.error.message);
    }

    return participantSummary;
  }

  for (const item of (cleanupEventsResult.data ?? []) as Array<{
    report_id: string;
    scheduled_at: string | null;
  }>) {
    const current = participantSummary.get(item.report_id) ?? {
      participantCount: 0,
      scheduledAt: null
    };
    current.scheduledAt = item.scheduled_at ?? null;
    participantSummary.set(item.report_id, current);
  }

  return participantSummary;
}

export async function loadPublicCommentSummaryByReportIds(reportIds: string[]) {
  if (reportIds.length === 0) {
    return new Map<string, ReportCommentSummary>();
  }

  const { data, error } = await supabaseAdmin
    .from("report_comments")
    .select("report_id, created_at")
    .in("report_id", reportIds)
    .eq("visibility", "public")
    .eq("is_hidden", false);

  if (error) {
    throw new Error(error.message);
  }

  const summaryMap = new Map<string, ReportCommentSummary>();

  for (const item of (data ?? []) as Array<{ report_id: string; created_at: string }>) {
    const current = summaryMap.get(item.report_id) ?? {
      publicCommentCount: 0,
      latestPublicCommentAt: null
    };

    current.publicCommentCount += 1;

    if (
      !current.latestPublicCommentAt ||
      new Date(item.created_at).getTime() > new Date(current.latestPublicCommentAt).getTime()
    ) {
      current.latestPublicCommentAt = item.created_at;
    }

    summaryMap.set(item.report_id, current);
  }

  return summaryMap;
}

export async function loadReporterProfilesByIds(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map<string, ReporterProfileRow>();
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as ReporterProfileRow[]).map((item) => [item.id, item])
  );
}

export async function loadCleanupEventsByReportIds(reportIds: string[]) {
  if (reportIds.length === 0) {
    return new Map<string, CleanupEventRow>();
  }

  const { data, error } = await supabaseAdmin
    .from("cleanup_events")
    .select(
      "id, report_id, scheduled_at, meeting_address, meeting_latitude, meeting_longitude, instructions_text, tools_note, created_by_user_id, updated_by_user_id, created_at, updated_at"
    )
    .in("report_id", reportIds);

  if (error) {
    if (isMissingCleanupEventsTable(error.message)) {
      return new Map<string, CleanupEventRow>();
    }

    throw new Error(error.message);
  }

  return new Map(
    ((data ?? []) as CleanupEventRow[]).map((item) => [item.report_id, item])
  );
}

export async function loadMediaByReportIds(
  reportIds: string[],
  options?: { includeHidden?: boolean }
) {
  if (reportIds.length === 0) {
    return new Map<string, ReportMediaRow[]>();
  }

  let query = supabaseAdmin
    .from("report_media")
    .select(
      "id, report_id, media_type, media_context, public_url, thumbnail_url, mime_type, size_bytes, width_px, height_px, duration_seconds, uploaded_by_user_id, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .in("report_id", reportIds)
    .order("created_at", { ascending: true });

  if (!options?.includeHidden) {
    query = query.eq("is_hidden", false);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingReportMediaTable(error.message)) {
      return new Map<string, ReportMediaRow[]>();
    }

    throw new Error(error.message);
  }

  const grouped = new Map<string, ReportMediaRow[]>();
  for (const item of (data ?? []) as ReportMediaRow[]) {
    const bucket = grouped.get(item.report_id) ?? [];
    bucket.push(item);
    grouped.set(item.report_id, bucket);
  }

  return grouped;
}

export async function createReport(input: CreateReportInput) {
  const locationWkt = `SRID=4326;POINT(${input.location.longitude} ${input.location.latitude})`;

  const { data, error } = await supabaseAdmin
    .from("reports")
    .insert({
      created_by_user_id: input.createdByUserId ?? null,
      source: input.source,
      title: input.title ?? null,
      description: input.description,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      location: locationWkt,
      accuracy_meters: input.location.accuracyMeters ?? null
    })
    .select(
      "id, created_by_user_id, status, source, title, description, latitude, longitude, accuracy_meters, published_at, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Report was not returned after insert.");
  }

  let insertedMedia: ReportMediaRow[] = [];
  const media = input.media ?? [];

  if (media.length > 0) {
    insertedMedia = await insertReportMedia(data.id, media, {
      mediaContext: "report",
      uploadedByUserId: input.createdByUserId ?? null
    });
  }

  return {
    report: data as ReportRow,
    media: insertedMedia
  };
}
