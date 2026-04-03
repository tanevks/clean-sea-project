import { supabase } from "./supabase";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export type UserNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  reportId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export function getNotificationMetadataString(
  notification: UserNotification,
  key: string
) {
  const value = notification.metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

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
    const accessToken = await getAccessToken();
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`
      }
    });

    const responseText = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const parsed =
      responseText && contentType.includes("application/json")
        ? (JSON.parse(responseText) as { error?: string })
        : null;

    if (!response.ok) {
      throw new Error(parsed?.error ?? `Request failed with status ${response.status}`);
    }

    return responseText ? (JSON.parse(responseText) as T) : ({} as T);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach API at ${apiBaseUrl}. Check that the API is running and reachable from this device.`
      );
    }

    throw error;
  }
}

export async function listUserNotifications(): Promise<UserNotification[]> {
  const body = await fetchJson<{ items: UserNotification[] }>("/v1/notifications?limit=50");
  return body.items;
}

export async function markAllNotificationsRead(): Promise<number> {
  const body = await fetchJson<{ updatedCount: number }>("/v1/notifications/read-all", {
    method: "POST"
  });

  return body.updatedCount;
}

export async function markNotificationRead(notificationId: string): Promise<UserNotification> {
  return fetchJson<UserNotification>(`/v1/notifications/${notificationId}/read`, {
    method: "PATCH"
  });
}

export async function deleteUserNotification(notificationId: string): Promise<void> {
  await fetchJson(`/v1/notifications/${notificationId}`, {
    method: "DELETE"
  });
}
