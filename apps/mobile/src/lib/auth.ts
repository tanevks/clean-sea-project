import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { AuthError, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const appAuthCallbackUrl = "cleansea://auth/callback";
const appResetPasswordUrl = "cleansea://auth/reset-password";
const webBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL?.replace(/\/+$/, "");
const authCallbackUrl = webBaseUrl
  ? `${webBaseUrl}/auth/mobile-callback`
  : appAuthCallbackUrl;
const resetPasswordUrl = webBaseUrl
  ? `${webBaseUrl}/auth/mobile-reset-password`
  : appResetPasswordUrl;

WebBrowser.maybeCompleteAuthSession();

export type AuthResult = {
  user: User | null;
  error: AuthError | null;
  hasSession: boolean;
  pendingExternalAuth?: boolean;
};

export type AuthUrlResult = {
  completed: boolean;
  flowType?: string;
  errorMessage?: string;
};

function getAllUrlParams(url: string) {
  const queryString = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const hashString = url.includes("#") ? url.split("#")[1] : "";

  const params = new URLSearchParams(queryString);
  const hashParams = new URLSearchParams(hashString);

  hashParams.forEach((value, key) => {
    params.set(key, value);
  });

  return params;
}

async function waitForUserSession(timeoutMs = 4000): Promise<User | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      return user;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  return null;
}

async function waitForAuthStateUser(timeoutMs = 12000): Promise<User | null> {
  return new Promise((resolve) => {
    let isResolved = false;

    const finish = (user: User | null) => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      subscription.unsubscribe();
      clearTimeout(timeout);
      resolve(user);
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        finish(session.user);
      }
    });

    const timeout = setTimeout(async () => {
      const fallbackUser = await waitForUserSession(500);
      finish(fallbackUser);
    }, timeoutMs);
  });
}

export async function completeAuthSessionFromUrl(
  url: string
): Promise<AuthUrlResult> {
  const params = getAllUrlParams(url);
  const errorDescription = params.get("error_description");
  const code = params.get("code");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const flowType = params.get("type") ?? undefined;

  if (errorDescription) {
    return {
      completed: false,
      flowType,
      errorMessage: errorDescription
    };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return {
        completed: false,
        flowType,
        errorMessage: error.message
      };
    }

    return {
      completed: true,
      flowType
    };
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    if (error) {
      return {
        completed: false,
        flowType,
        errorMessage: error.message
      };
    }

    return {
      completed: true,
      flowType
    };
  }

  return {
    completed: false,
    flowType,
    errorMessage: "Missing auth session data in redirect URL."
  };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  nickname: string,
  phone: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: nickname,
        nickname,
        phone: phone.trim() || undefined
      },
      emailRedirectTo: authCallbackUrl
    }
  });

  if (data.session) {
    await supabase.auth.signOut();
  }

  return {
    user: data.user,
    error,
    hasSession: false
  };
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  return {
    user: data.user,
    error,
    hasSession: Boolean(data.session)
  };
}

export async function signInWithGoogle(): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrl,
      skipBrowserRedirect: true
    }
  });

  if (error || !data?.url) {
    return {
      user: null,
      error,
      hasSession: false,
      pendingExternalAuth: false
    };
  }

  const authStatePromise = waitForAuthStateUser();
  const redirectUrl = Platform.OS === "android" ? authCallbackUrl : appAuthCallbackUrl;
  const authSession = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (authSession.type === "success" && authSession.url) {
    const result = await completeAuthSessionFromUrl(authSession.url);
    if (!result.completed) {
      return {
        user: null,
        error: result.errorMessage
          ? ({ message: result.errorMessage } as AuthError)
          : null,
        hasSession: false,
        pendingExternalAuth: false
      };
    }
  }

  if (authSession.type === "cancel" || authSession.type === "dismiss") {
    return {
      user: null,
      error: ({ message: "Google sign-in did not complete." } as AuthError),
      hasSession: false,
      pendingExternalAuth: false
    };
  }

  const user = (await authStatePromise) ?? (await waitForUserSession(1500));
  if (user) {
    return {
      user,
      error: null,
      hasSession: true,
      pendingExternalAuth: false
    };
  }

  return {
    user: null,
    error: null,
    hasSession: false,
    pendingExternalAuth: false
  };
}

export async function sendPasswordReset(email: string): Promise<AuthError | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetPasswordUrl
  });

  return error;
}

export async function updatePassword(
  password: string
): Promise<AuthError | null> {
  const { error } = await supabase.auth.updateUser({
    password
  });

  return error;
}

export async function signOut(): Promise<AuthError | null> {
  const { error } = await supabase.auth.signOut();
  return error;
}
