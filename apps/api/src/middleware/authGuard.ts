import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../types/auth";
import { supabaseAdmin } from "../lib/supabaseAdmin";

function parseBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function resolveRoleFromToken(
  appMetadata: Record<string, unknown> | undefined
): UserRole {
  const value = appMetadata?.role;
  if (value === "moderator" || value === "admin") {
    return value;
  }
  return "citizen";
}

async function resolveProfileState(
  userId: string
): Promise<{ role: UserRole | null; isActive: boolean | null }> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { role: null, isActive: null };
  }

  const role =
    data.role === "citizen" || data.role === "moderator" || data.role === "admin"
      ? data.role
      : null;

  return {
    role,
    isActive: typeof data.is_active === "boolean" ? data.is_active : null
  };
}

export async function authGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const accessToken = parseBearerToken(req.headers.authorization);
  if (!accessToken) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  const profileState = await resolveProfileState(data.user.id);

  if (profileState.isActive === false) {
    res.status(403).json({ error: "Account is inactive." });
    return;
  }

  req.authUser = {
    id: data.user.id,
    email: data.user.email ?? null,
    role:
      profileState.role ??
      resolveRoleFromToken(data.user.app_metadata)
    ,
    isActive: profileState.isActive ?? true
  };

  next();
}
