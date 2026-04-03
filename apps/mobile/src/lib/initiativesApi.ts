import { supabase } from "./supabase";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export type InitiativeSummary = {
  id: string;
  submitterName: string;
  category: "idea" | "initiative";
  status: "approved" | "published" | "executed";
  title: string;
  description: string;
  publishedAt: string | null;
  createdAt: string;
  commentSummary?: {
    publicCommentCount: number;
    latestPublicCommentAt: string | null;
  };
};

export type InitiativeComment = {
  id: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  visibility: "public" | "internal";
  message: string;
  isHidden?: boolean;
  hiddenAt?: string | null;
  hiddenByUserId?: string | null;
  hiddenReason?: string | null;
  createdAt: string;
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

  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const responseText = await response.text();
  const json = responseText
    ? (JSON.parse(responseText) as { error?: string })
    : null;

  if (!response.ok) {
    throw new Error(json?.error ?? `Request failed with status ${response.status}`);
  }

  return json as T;
}

export async function listPublishedInitiatives(): Promise<InitiativeSummary[]> {
  const body = await fetchJson<{ items: InitiativeSummary[] }>("/v1/initiatives/public");
  return body.items;
}

export async function listInitiativeComments(
  initiativeId: string
): Promise<InitiativeComment[]> {
  const accessToken = await getAccessToken();
  const body = await fetchJson<{ items: InitiativeComment[] }>(
    `/v1/initiatives/${initiativeId}/comments`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return body.items;
}

export async function createInitiativeComment(
  initiativeId: string,
  message: string
): Promise<InitiativeComment> {
  const accessToken = await getAccessToken();
  return fetchJson<InitiativeComment>(`/v1/initiatives/${initiativeId}/comments`, {
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
