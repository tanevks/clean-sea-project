import { supabase } from "./supabase";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export type PublicPeriod = "all" | "year" | "season";
export type PublicMapMetric =
  | "total"
  | "active"
  | "in_review"
  | "planned_cleanup"
  | "resolved"
  | "rejected";

export type CampaignStatus = "draft" | "active" | "completed";

export type ProfileResponse = {
  id: string;
  email: string | null;
  role: "citizen" | "moderator" | "admin";
  displayName?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  contactPhone?: string | null;
};

export type AdminUserItem = {
  id: string;
  email: string | null;
  role: "citizen" | "moderator" | "admin";
  displayName: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type AuditLogItem = {
  id: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorRole: "citizen" | "moderator" | "admin";
  action: string;
  entityType: string;
  entityId: string | null;
  reportId: string | null;
  targetUserId: string | null;
  targetDisplayName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ReportLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

export type ReportMedia = {
  id: string;
  mediaType: "image" | "video";
  mediaContext?: "report" | "cleanup_evidence";
  url: string;
  thumbnailUrl?: string | null;
  mimeType?: string;
  sizeBytes?: number;
  widthPx?: number | null;
  heightPx?: number | null;
  durationSeconds?: number | null;
  uploadedByUserId?: string | null;
  isHidden?: boolean;
  hiddenAt?: string | null;
  hiddenByUserId?: string | null;
  hiddenReason?: string | null;
  createdAt?: string;
};

export type CleanupEvent = {
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

export type CleanupSummary = {
  participantCount: number;
  scheduledAt: string | null;
};

export type ReportSummary = {
  id: string;
  status: "new" | "in_review" | "planned_cleanup" | "resolved" | "rejected";
  source: "mobile" | "web" | "chat";
  title?: string | null;
  description: string;
  createdBy?: {
    userId: string | null;
    displayName: string | null;
  };
  commentSummary?: {
    publicCommentCount: number;
    latestPublicCommentAt: string | null;
  };
  resolutionNote?: {
    note: string | null;
    createdAt: string | null;
  } | null;
  campaign?: CampaignItem | null;
  cleanupEvent?: CleanupEvent | null;
  cleanupSummary?: CleanupSummary | null;
  location: ReportLocation;
  media: ReportMedia[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type ReportStatusHistoryItem = {
  id?: string;
  fromStatus?: ReportSummary["status"] | null;
  toStatus: ReportSummary["status"];
  changedByUserId?: string | null;
  changedByDisplayName?: string | null;
  note?: string | null;
  createdAt?: string;
};

export type ReportCommentItem = {
  id: string;
  authorUserId?: string | null;
  authorDisplayName?: string | null;
  visibility: "public" | "internal";
  message: string;
  isHidden?: boolean;
  hiddenAt?: string | null;
  hiddenByUserId?: string | null;
  hiddenReason?: string | null;
  createdAt: string;
};

export type CleanupParticipantItem = {
  id: string;
  userId: string;
  displayName: string | null;
  joinedAt: string;
};

export type PublicStatsResponse = {
  period: PublicPeriod;
  campaign: CampaignItem | null;
  generatedAt: string;
  counts: {
    total: number;
    active: number;
    new: number;
    inReview: number;
    plannedCleanup: number;
    resolved: number;
    rejected: number;
  };
};

export type PublicActivityResponse = {
  period: PublicPeriod;
  campaign: CampaignItem | null;
  generatedAt: string;
  monthly: Array<{
    key: string;
    label: string;
    reports: number;
    resolved: number;
    cleanups: number;
  }>;
  topParticipants: Array<{
    userId: string;
    displayName: string | null;
    cleanupCount: number;
    resolvedCount: number;
  }>;
  topReporters: Array<{
    userId: string;
    displayName: string | null;
    reportCount: number;
    resolvedCount: number;
  }>;
};

export type CampaignItem = {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: CampaignStatus;
  createdByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type InitiativeItem = {
  id: string;
  submitterUserId: string | null;
  submitterName: string;
  submitterEmail: string;
  submitterPhone: string | null;
  category: "idea" | "initiative";
  title: string;
  description: string;
  status: "new" | "approved" | "rejected" | "published" | "executed" | "inactive";
  reviewNote: string | null;
  reviewedByUserId: string | null;
  implementationPlan: string | null;
  implementationReport: string | null;
  planUpdatedAt: string | null;
  reportUpdatedAt: string | null;
  planUpdatedByUserId: string | null;
  reportUpdatedByUserId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicInitiativeItem = {
  id: string;
  submitterName: string;
  category: "idea" | "initiative";
  title: string;
  description: string;
  status: "approved" | "published" | "executed";
  implementationPlan: string | null;
  implementationReport: string | null;
  planUpdatedAt: string | null;
  reportUpdatedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  commentSummary?: {
    publicCommentCount: number;
    latestPublicCommentAt: string | null;
  };
};

export type InitiativeCommentItem = {
  id: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  visibility: "public" | "internal";
  message: string;
  isHidden: boolean;
  hiddenAt: string | null;
  hiddenByUserId: string | null;
  hiddenReason: string | null;
  createdAt: string;
};

export type MaintenanceSummary = {
  counts: {
    users: number;
    nonAdminUsers: number;
    reports: number;
    reportComments: number;
    reportMedia: number;
    cleanupParticipants: number;
    cleanupEvents: number;
    initiatives: number;
    initiativeComments: number;
    campaigns: number;
    serviceAreas: number;
    notifications: number;
    auditLogs: number;
  };
};

export type MaintenanceArchive = {
  format: string;
  version: number;
  exportedAt: string;
  exportedByUserId: string | null;
  notes: string[];
  userSnapshots: Array<{
    id: string;
    email: string | null;
    role: "citizen" | "moderator" | "admin";
    displayName: string | null;
    isActive: boolean;
  }>;
  data: {
    serviceAreas: unknown[];
    campaigns: unknown[];
    reports: unknown[];
    reportStatusHistory: unknown[];
    reportComments: unknown[];
    cleanupEvents: unknown[];
    cleanupParticipants: unknown[];
    reportCampaigns: unknown[];
    initiatives: unknown[];
    initiativeComments: unknown[];
    mediaManifest: unknown[];
  };
};

export type MaintenanceResetResult = {
  deleted: Record<string, number>;
  skipped: Record<string, number>;
};

export type MaintenanceRestoreResult = {
  restored: Record<string, number>;
  skipped: Record<string, number>;
  warnings: string[];
};

export type MaintenanceDeleteEntityType =
  | "user"
  | "report"
  | "initiative"
  | "campaign"
  | "service_area";

export type InitiativeMetaResponse = {
  newCount: number;
};

export type ServiceAreaItem = {
  id: string;
  name: string;
  geojson: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ModerationAlertsResponse = {
  generatedAt: string;
  counts: {
    newReports: number;
    newInitiatives: number;
    newInitiativeComments: number;
    unscheduledCleanups: number;
    total: number;
  };
  newReports: Array<{
    id: string;
    title: string | null;
    description: string;
    source: "mobile" | "web" | "chat";
    createdAt: string;
    reporterDisplayName: string | null;
  }>;
  newInitiatives: Array<{
    id: string;
    submitterName: string;
    category: "idea" | "initiative";
    title: string;
    createdAt: string;
  }>;
  newInitiativeComments: Array<{
    id: string;
    initiativeId: string;
    initiativeTitle: string;
    authorDisplayName: string | null;
    message: string;
    createdAt: string;
  }>;
  unscheduledCleanups: Array<{
    id: string;
    title: string | null;
    description: string;
    createdAt: string;
    reporterDisplayName: string | null;
    participantCount: number;
  }>;
};

export type ModerationAlertEntityType =
  | "new_report"
  | "new_initiative"
  | "initiative_comment"
  | "unscheduled_cleanup";

export type PublicMapReportItem = {
  id: string;
  status: ReportSummary["status"];
  title: string | null;
  description: string;
  location: ReportLocation;
  media: ReportMedia[];
  cleanupEvent: CleanupEvent | null;
  resolutionNote: {
    note: string | null;
    createdAt: string | null;
  } | null;
  createdAt: string;
  publishedAt?: string;
};

export type PublicMapResponse = {
  period: PublicPeriod;
  campaign: CampaignItem | null;
  generatedAt: string;
  metric: PublicMapMetric;
  color: string;
  counts: {
    matching: number;
    mapped: number;
    excludedPrivate: number;
  };
  items: PublicMapReportItem[];
};

export type PrivateDashboardResponse = {
  generatedAt: string;
  myReports: ReportSummary[];
  myCleanups: Array<{
    joinedAt: string;
    report: ReportSummary;
  }>;
  stats: {
    reportCount: number;
    activeReportCount: number;
    resolvedReportCount: number;
    cleanupJoinCount: number;
    cleanupResolvedCount: number;
    upcomingCleanupCount: number;
  };
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No active session.");
  }

  return session.access_token;
}

function formatApiDetails(details: unknown): string {
  if (!details) {
    return "";
  }

  if (typeof details === "string") {
    return details;
  }

  if (Array.isArray(details)) {
    const flattened = details
      .map((item) => (typeof item === "string" ? item : ""))
      .filter(Boolean);
    return flattened.join(" ");
  }

  if (typeof details === "object") {
    const record = details as Record<string, unknown>;

    if (Array.isArray(record.formErrors) && record.formErrors.length > 0) {
      return record.formErrors.filter((item): item is string => typeof item === "string").join(" ");
    }

    if (record.fieldErrors && typeof record.fieldErrors === "object") {
      const fieldErrors = record.fieldErrors as Record<string, unknown>;
      const firstEntry = Object.entries(fieldErrors).find(([, value]) => Array.isArray(value) && value.length > 0);
      if (firstEntry) {
        const [fieldName, value] = firstEntry;
        const firstMessage = (value as unknown[]).find((item) => typeof item === "string");
        if (typeof firstMessage === "string") {
          return `${fieldName}: ${firstMessage}`;
        }
      }
    }

    try {
      return JSON.stringify(details);
    } catch {
      return "";
    }
  }

  return "";
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`
    }
  });

  const bodyText = await response.text();
  const json = bodyText
    ? (JSON.parse(bodyText) as { error?: string; details?: string })
    : null;

  if (!response.ok) {
    const detailsText = formatApiDetails(json?.details);
    throw new Error(
      detailsText
        ? `${json?.error ?? "Request failed"} ${detailsText}`
        : (json?.error ?? `Request failed with status ${response.status}`)
    );
  }

  return json as T;
}

async function fetchPublicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const bodyText = await response.text();
  const json = bodyText
    ? (JSON.parse(bodyText) as { error?: string; details?: string })
    : null;

  if (!response.ok) {
    const detailsText = formatApiDetails(json?.details);
    throw new Error(
      detailsText
        ? `${json?.error ?? "Request failed"} ${detailsText}`
        : (json?.error ?? `Request failed with status ${response.status}`)
    );
  }

  return json as T;
}

export async function fetchMe() {
  return fetchJson<ProfileResponse>("/v1/auth/me");
}

export async function fetchPrivateDashboard() {
  return fetchJson<PrivateDashboardResponse>("/v1/auth/dashboard");
}

export async function updateMe(payload: {
  nickname?: string;
  displayName?: string;
  phone?: string;
  contactPhone?: string;
}) {
  return fetchJson<ProfileResponse>("/v1/auth/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchReports(status?: ReportSummary["status"] | "all") {
  const params = new URLSearchParams({ limit: "100" });
  if (status && status !== "all") {
    params.set("status", status);
  }

  const response = await fetchJson<{ items: ReportSummary[] }>(
    `/v1/reports?${params.toString()}`
  );

  return response.items;
}

export async function fetchPublicStats(period: PublicPeriod, campaignId?: string) {
  const params = new URLSearchParams({ period });
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  return fetchPublicJson<PublicStatsResponse>(`/v1/public/stats?${params.toString()}`);
}

export async function fetchPublicActivity(period: PublicPeriod, campaignId?: string) {
  const params = new URLSearchParams({ period });
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  return fetchPublicJson<PublicActivityResponse>(`/v1/public/activity?${params.toString()}`);
}

export function getPublicExportUrl(period: PublicPeriod, campaignId?: string) {
  const params = new URLSearchParams({ period });
  if (campaignId) {
    params.set("campaignId", campaignId);
  }

  return `${apiBaseUrl}/v1/public/export.csv?${params.toString()}`;
}

export function getPublicPrintUrl(period: PublicPeriod, campaignId?: string) {
  const params = new URLSearchParams({ period });
  if (campaignId) {
    params.set("campaignId", campaignId);
  }

  return `/dashboard/print?${params.toString()}`;
}

export async function fetchPublicMap(
  metric: PublicMapMetric,
  period: PublicPeriod,
  campaignId?: string
) {
  const params = new URLSearchParams({ metric, period });
  if (campaignId) {
    params.set("campaignId", campaignId);
  }

  return fetchPublicJson<PublicMapResponse>(`/v1/public/map?${params.toString()}`);
}

export function getPublicMapUrl(
  metric: PublicMapMetric,
  period: PublicPeriod,
  campaignId?: string
) {
  const params = new URLSearchParams({ metric, period });
  if (campaignId) {
    params.set("campaignId", campaignId);
  }

  return `/dashboard/map?${params.toString()}`;
}

export async function fetchPublicCampaigns() {
  const response = await fetchPublicJson<{ items: CampaignItem[] }>("/v1/campaigns/public");
  return response.items;
}

export async function fetchCampaigns() {
  const response = await fetchJson<{ items: CampaignItem[] }>("/v1/campaigns");
  return response.items;
}

export async function createCampaign(payload: {
  name: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  status: CampaignStatus;
}) {
  return fetchJson<CampaignItem>("/v1/campaigns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function updateCampaign(
  campaignId: string,
  payload: {
    name: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    status: CampaignStatus;
  }
) {
  return fetchJson<CampaignItem>(`/v1/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function listPublishedInitiatives() {
  const response = await fetchPublicJson<{ items: PublicInitiativeItem[] }>(
    "/v1/initiatives/public"
  );
  return response.items;
}

export async function submitInitiative(payload: {
  submitterName: string;
  submitterEmail: string;
  submitterPhone?: string;
  category: "idea" | "initiative";
  title: string;
  description: string;
}) {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return fetchPublicJson<InitiativeItem>("/v1/initiatives/public", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {})
    },
    body: JSON.stringify(payload)
  });
}

export async function listInitiatives(
  status?: InitiativeItem["status"] | "all"
) {
  const params = new URLSearchParams();
  if (status && status !== "all") {
    params.set("status", status);
  }

  const response = await fetchJson<{ items: InitiativeItem[] }>(
    `/v1/initiatives${params.toString() ? `?${params.toString()}` : ""}`
  );
  return response.items;
}

export async function fetchInitiativeMeta() {
  return fetchJson<InitiativeMetaResponse>("/v1/initiatives/meta");
}

export async function fetchModerationAlerts() {
  return fetchJson<ModerationAlertsResponse>("/v1/moderation/alerts");
}

export async function markModerationAlertRead(
  entityType: ModerationAlertEntityType,
  entityId: string
) {
  await fetchJson<void>("/v1/moderation/alerts/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ entityType, entityId })
  });
}

export async function markAllModerationAlertsRead() {
  await fetchJson<void>("/v1/moderation/alerts/read-all", {
    method: "POST"
  });
}

export async function updateInitiative(
  initiativeId: string,
  payload: {
    status?: "approved" | "rejected" | "published" | "executed" | "inactive";
    reviewNote?: string;
    implementationPlan?: string;
    implementationReport?: string;
  }
) {
  return fetchJson<InitiativeItem>(`/v1/initiatives/${initiativeId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function moderateInitiativeComment(
  initiativeId: string,
  commentId: string,
  payload: { isHidden: boolean; reason?: string }
) {
  return fetchJson<InitiativeCommentItem>(
    `/v1/initiatives/${initiativeId}/comments/${commentId}/moderation`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
}

export async function fetchReport(reportId: string) {
  return fetchJson<ReportSummary>(`/v1/reports/${reportId}`);
}

export async function updateReportStatus(
  reportId: string,
  payload: { status: ReportSummary["status"]; note?: string }
) {
  return fetchJson<ReportSummary>(`/v1/reports/${reportId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function updateReportCampaign(
  reportId: string,
  payload: { campaignId: string | null }
) {
  return fetchJson<ReportSummary>(`/v1/reports/${reportId}/campaign`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchReportHistory(reportId: string) {
  const response = await fetchJson<{ items: ReportStatusHistoryItem[] }>(
    `/v1/reports/${reportId}/history`
  );

  return response.items;
}

export async function fetchReportComments(reportId: string) {
  const response = await fetchJson<{ items: ReportCommentItem[] }>(
    `/v1/reports/${reportId}/comments`
  );

  return response.items;
}

export async function fetchReportCleanupParticipants(reportId: string) {
  const response = await fetchJson<{ items: CleanupParticipantItem[] }>(
    `/v1/reports/${reportId}/cleanup-participants`
  );

  return response.items;
}

export async function removeReportCleanupParticipant(
  reportId: string,
  userId: string
) {
  const response = await fetchJson<{ items: CleanupParticipantItem[] }>(
    `/v1/reports/${reportId}/cleanup-participants/${userId}`,
    {
      method: "DELETE"
    }
  );

  return response.items;
}

export async function updateReportCleanupEvent(
  reportId: string,
  payload: {
    scheduledAt: string;
    meetingAddress: string;
    meetingLatitude?: number | null;
    meetingLongitude?: number | null;
    instructionsText: string;
    toolsNote?: string | null;
  }
) {
  return fetchJson<CleanupEvent>(`/v1/reports/${reportId}/cleanup-event`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function createReportComment(
  reportId: string,
  payload: { message: string; visibility?: "public" | "internal" }
) {
  return fetchJson<ReportCommentItem>(`/v1/reports/${reportId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function moderateReportComment(
  reportId: string,
  commentId: string,
  payload: { isHidden: boolean; reason?: string }
) {
  return fetchJson<ReportCommentItem>(
    `/v1/reports/${reportId}/comments/${commentId}/moderation`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
}

export async function moderateReportMedia(
  reportId: string,
  mediaId: string,
  payload: { isHidden: boolean; reason?: string }
) {
  return fetchJson<ReportMedia>(`/v1/reports/${reportId}/media/${mediaId}/moderation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function fetchAdminUsers() {
  const response = await fetchJson<{ items: AdminUserItem[] }>("/v1/admin/users");
  return response.items;
}

export async function fetchAdminAudit() {
  const response = await fetchJson<{ items: AuditLogItem[] }>("/v1/admin/audit");
  return response.items;
}

export async function updateAdminUserRole(
  userId: string,
  role: AdminUserItem["role"]
) {
  return fetchJson<AdminUserItem>(`/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ role })
  });
}

export async function updateAdminUserActiveState(
  userId: string,
  isActive: boolean
) {
  return fetchJson<AdminUserItem>(`/v1/admin/users/${userId}/active`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ isActive })
  });
}

export async function fetchServiceAreas() {
  const response = await fetchJson<{ items: ServiceAreaItem[] }>("/v1/admin/service-areas");
  return response.items;
}

export async function geocodeServiceAreaSearch(query: string) {
  return fetchJson<{ latitude: number; longitude: number }>(
    "/v1/admin/service-areas/geocode",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    }
  );
}

export async function createServiceArea(payload: {
  name: string;
  geojson: unknown;
  isActive: boolean;
}) {
  return fetchJson<ServiceAreaItem>("/v1/admin/service-areas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function listInitiativeComments(initiativeId: string) {
  const response = await fetchJson<{ items: InitiativeCommentItem[] }>(
    `/v1/initiatives/${initiativeId}/comments`
  );
  return response.items;
}

export async function listPublicInitiativeComments(initiativeId: string) {
  const response = await fetchPublicJson<{ items: InitiativeCommentItem[] }>(
    `/v1/initiatives/public/${initiativeId}/comments`
  );
  return response.items;
}

export async function createInitiativeComment(
  initiativeId: string,
  payload: { message: string; visibility?: "public" | "internal" }
) {
  return fetchJson<InitiativeCommentItem>(`/v1/initiatives/${initiativeId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function updateServiceArea(
  serviceAreaId: string,
  payload: {
    name: string;
    geojson: unknown;
    isActive: boolean;
  }
) {
  return fetchJson<ServiceAreaItem>(`/v1/admin/service-areas/${serviceAreaId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteServiceArea(serviceAreaId: string) {
  await fetchJson<void>(`/v1/admin/service-areas/${serviceAreaId}`, {
    method: "DELETE"
  });
}

export async function fetchMaintenanceSummary() {
  return fetchJson<MaintenanceSummary>("/v1/admin/maintenance/summary");
}

export async function exportMaintenanceArchive() {
  return fetchJson<MaintenanceArchive>("/v1/admin/maintenance/archive");
}

export async function resetMaintenanceData(payload: {
  confirmation: string;
  includeUsers?: boolean;
}) {
  return fetchJson<MaintenanceResetResult>("/v1/admin/maintenance/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function restoreMaintenanceArchive(payload: {
  confirmation: string;
  archive: MaintenanceArchive;
}) {
  return fetchJson<MaintenanceRestoreResult>("/v1/admin/maintenance/restore", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function deleteMaintenanceEntity(payload: {
  entityType: MaintenanceDeleteEntityType;
  entityId: string;
}) {
  await fetchJson<void>("/v1/admin/maintenance/delete-entity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}
