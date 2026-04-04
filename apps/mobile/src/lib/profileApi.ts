import { supabase } from "./supabase";

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

export type MobileProfile = {
  id: string;
  email: string | null;
  role: "citizen" | "moderator" | "admin";
  approvalStatus: "pending" | "approved" | "rejected";
  isActive: boolean;
  displayName?: string | null;
  nickname?: string | null;
  phone?: string | null;
  contactPhone?: string | null;
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

export async function fetchProfile(): Promise<MobileProfile> {
  return fetchJson<MobileProfile>("/v1/auth/me");
}

export async function updateProfile(input: {
  nickname: string;
  phone: string;
}): Promise<MobileProfile> {
  return fetchJson<MobileProfile>("/v1/auth/me", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nickname: input.nickname.trim(),
      contactPhone: input.phone.trim() || null
    })
  });
}
