import { supabase } from "./supabase";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

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

export type ReportSummary = {
  id: string;
  status: string;
  source: string;
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
  cleanupSummary?: {
    participantCount: number;
    scheduledAt: string | null;
  } | null;
  cleanupEvent?: CleanupEvent | null;
  location: ReportLocation;
  media: ReportMedia[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type CreateReportMediaInput = {
  storageKey: string;
  mediaType: "image" | "video";
  mimeType: string;
  sizeBytes: number;
  widthPx?: number;
  heightPx?: number;
  durationSeconds?: number;
};

export type ReportComment = {
  id: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  visibility: "public" | "internal";
  message: string;
  createdAt: string;
};

export type CleanupParticipant = {
  id: string;
  userId: string;
  displayName: string | null;
  joinedAt: string;
};

export type ServiceArea = {
  id: string;
  name: string;
  geojson: unknown;
};

export type CreateReportInput = {
  description: string;
  location: ReportLocation;
  media?: CreateReportMediaInput[];
};

export type CreateUploadInput = {
  fileName: string;
  contentType: string;
  mediaType: "image" | "video";
  sizeBytes: number;
};

export type PresignedUpload = {
  uploadId: string;
  bucket: string;
  storageKey: string;
  uploadUrl: string;
  uploadToken: string;
  contentType: string;
  mediaType: "image" | "video";
  sizeBytes: number;
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
  }

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, init);
    const responseText = await response.text();
    const contentType = response.headers.get("content-type") ?? "";

    const parseJsonBody = () => {
      if (!responseText) {
        return null;
      }

      if (!contentType.includes("application/json")) {
        return null;
      }

      try {
        return JSON.parse(responseText) as { error?: string };
      } catch {
        return null;
      }
    };

    if (!response.ok) {
      const errorBody = parseJsonBody();
      const htmlSnippet =
        responseText.trim().startsWith("<")
          ? "Server returned HTML instead of JSON."
          : undefined;

      throw new Error(
        errorBody?.error ??
          htmlSnippet ??
          `Request failed with status ${response.status}`
      );
    }

    const parsed = parseJsonBody();
    if (!parsed && responseText.trim().startsWith("<")) {
      throw new Error("Server returned HTML instead of JSON.");
    }

    return JSON.parse(responseText) as T;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach API at ${apiBaseUrl}. Check that the API is running and reachable from this device.`
      );
    }

    throw error;
  }
}

export async function listReports(): Promise<ReportSummary[]> {
  const accessToken = await getAccessToken();
  const body = await fetchJson<{ items: ReportSummary[] }>("/v1/reports?limit=50", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  return body.items;
}

export async function fetchResolvedReportSummary(
  reportId: string
): Promise<ReportSummary> {
  const accessToken = await getAccessToken();
  return fetchJson<ReportSummary>(`/v1/reports/${reportId}/resolved-summary`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
}

export async function createReport(
  input: CreateReportInput
): Promise<ReportSummary> {
  const accessToken = await getAccessToken();
  return fetchJson<ReportSummary>("/v1/reports", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      description: input.description,
      location: input.location,
      media: input.media ?? [],
      source: "mobile"
    })
  });
}

export async function listActiveServiceAreas(): Promise<ServiceArea[]> {
  const accessToken = await getAccessToken();
  const body = await fetchJson<{ items: ServiceArea[] }>("/v1/reports/service-areas", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  return body.items;
}

export async function appendReportMedia(
  reportId: string,
  media: CreateReportMediaInput[]
): Promise<ReportSummary> {
  const accessToken = await getAccessToken();
  return fetchJson<ReportSummary>(`/v1/reports/${reportId}/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ media })
  });
}

export async function createUploadSlot(
  input: CreateUploadInput
): Promise<PresignedUpload> {
  const accessToken = await getAccessToken();
  return fetchJson<PresignedUpload>("/v1/uploads/presign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(input)
  });
}

export async function listReportComments(reportId: string): Promise<ReportComment[]> {
  const accessToken = await getAccessToken();
  const body = await fetchJson<{ items: ReportComment[] }>(
    `/v1/reports/${reportId}/comments`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return body.items;
}

export async function createReportComment(
  reportId: string,
  message: string
): Promise<ReportComment> {
  const accessToken = await getAccessToken();
  return fetchJson<ReportComment>(`/v1/reports/${reportId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      message,
      visibility: "public"
    })
  });
}

export async function listCleanupParticipants(
  reportId: string
): Promise<CleanupParticipant[]> {
  const accessToken = await getAccessToken();
  const body = await fetchJson<{ items: CleanupParticipant[] }>(
    `/v1/reports/${reportId}/cleanup-participants`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return body.items;
}

export async function joinCleanup(
  reportId: string
): Promise<CleanupParticipant[]> {
  const accessToken = await getAccessToken();
  const body = await fetchJson<{ items: CleanupParticipant[] }>(
    `/v1/reports/${reportId}/cleanup-participants`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return body.items;
}

export async function leaveCleanup(
  reportId: string
): Promise<CleanupParticipant[]> {
  const accessToken = await getAccessToken();
  const body = await fetchJson<{ items: CleanupParticipant[] }>(
    `/v1/reports/${reportId}/cleanup-participants/me`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return body.items;
}
