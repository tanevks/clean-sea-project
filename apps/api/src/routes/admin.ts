import { Router } from "express";
import { z } from "zod";
import { listAuditLogs, writeAuditLog } from "../lib/auditLog";
import { env } from "../lib/env";
import { resolveCoordinatesFromInput } from "../lib/locationInput";
import { authGuard } from "../middleware/authGuard";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const userIdSchema = z.object({
  id: z.string().uuid()
});

const updateRoleSchema = z.object({
  role: z.enum(["citizen", "moderator", "admin"])
});

const updateActiveSchema = z.object({
  isActive: z.boolean()
});

const updateApprovalSchema = z.object({
  approvalStatus: z.enum(["pending", "approved", "rejected"])
});

const serviceAreaBodySchema = z.object({
  name: z.string().min(3).max(160),
  geojson: z.unknown(),
  isActive: z.boolean().default(true)
});

const serviceAreaIdSchema = z.object({
  id: z.string().uuid()
});

const serviceAreaGeocodeSchema = z.object({
  query: z.string().min(3).max(500)
});

const maintenanceResetSchema = z.object({
  confirmation: z.string().trim(),
  includeUsers: z.boolean().optional().default(false)
});

const maintenanceRestoreSchema = z.object({
  confirmation: z.string().trim(),
  archive: z.unknown()
});

const maintenanceDeleteEntitySchema = z.object({
  entityType: z.enum(["user", "report", "initiative", "campaign", "service_area"]),
  entityId: z.string().uuid()
});

type ProfileRow = {
  id: string;
  role: "citizen" | "moderator" | "admin";
  display_name: string | null;
  phone: string | null;
  is_active: boolean;
  approval_status: "pending" | "approved" | "rejected";
};

type ServiceAreaRow = {
  id: string;
  name: string;
  geojson: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ArchivePayload = {
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
    serviceAreas: Array<Record<string, unknown>>;
    campaigns: Array<Record<string, unknown>>;
    reports: Array<Record<string, unknown>>;
    reportStatusHistory: Array<Record<string, unknown>>;
    reportComments: Array<Record<string, unknown>>;
    cleanupEvents: Array<Record<string, unknown>>;
    cleanupParticipants: Array<Record<string, unknown>>;
    reportCampaigns: Array<Record<string, unknown>>;
    initiatives: Array<Record<string, unknown>>;
    initiativeComments: Array<Record<string, unknown>>;
    mediaManifest: Array<Record<string, unknown>>;
  };
};

function isValidPosition(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1]) &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function isValidLinearRing(value: unknown) {
  if (!Array.isArray(value) || value.length < 4) {
    return false;
  }

  const ring = value as unknown[];
  if (!ring.every(isValidPosition)) {
    return false;
  }

  const first = ring[0] as number[];
  const last = ring[ring.length - 1] as number[];
  return first[0] === last[0] && first[1] === last[1];
}

function isValidPolygonCoordinates(value: unknown) {
  return Array.isArray(value) && value.length > 0 && value.every(isValidLinearRing);
}

function isValidServiceAreaGeoJson(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  const coordinates = (value as { coordinates?: unknown }).coordinates;

  if (type === "Polygon") {
    return isValidPolygonCoordinates(coordinates);
  }

  if (type === "MultiPolygon") {
    return (
      Array.isArray(coordinates) &&
      coordinates.length > 0 &&
      coordinates.every(isValidPolygonCoordinates)
    );
  }

  return false;
}

function toServiceAreaResponse(item: ServiceAreaRow) {
  return {
    id: item.id,
    name: item.name,
    geojson: item.geojson,
    isActive: item.is_active,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

async function loadProfileNamesByIds(userIds: string[]) {
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
    ((data ?? []) as Array<{ id: string; display_name: string | null }>).map((item) => [
      item.id,
      item.display_name
    ])
  );
}

function requireAdmin(role: "citizen" | "moderator" | "admin" | undefined) {
  return role === "admin";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function countRows(table: string, column = "id") {
  const result = await supabaseAdmin
    .from(table)
    .select(column, { count: "exact", head: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.count ?? 0;
}

async function deleteAllRows(table: string, filterColumn: string) {
  const beforeCount = await countRows(table, filterColumn);
  if (beforeCount === 0) {
    return 0;
  }

  const result = await supabaseAdmin
    .from(table)
    .delete()
    .not(filterColumn, "is", null);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return beforeCount;
}

async function loadAuthUserIds() {
  const result = await supabaseAdmin.from("profiles").select("id");

  if (result.error) {
    throw new Error(result.error.message);
  }

  return new Set(
    ((result.data ?? []) as Array<{ id: string }>).map((item) => item.id)
  );
}

function normalizeNullableUserId(value: unknown, existingUserIds: Set<string>) {
  return typeof value === "string" && existingUserIds.has(value) ? value : null;
}

function buildReportLocationWkt(
  latitude: number | null | undefined,
  longitude: number | null | undefined
) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }

  return `SRID=4326;POINT(${longitude} ${latitude})`;
}

async function deleteReportMediaStorageFiles() {
  const mediaResult = await supabaseAdmin
    .from("report_media")
    .select("storage_key");

  if (mediaResult.error) {
    throw new Error(mediaResult.error.message);
  }

  const storageKeys = ((mediaResult.data ?? []) as Array<{ storage_key: string | null }>)
    .map((item) => item.storage_key)
    .filter((item): item is string => Boolean(item));

  for (const chunk of chunkArray(storageKeys, 100)) {
    const removeResult = await supabaseAdmin.storage
      .from(env.REPORT_MEDIA_BUCKET)
      .remove(chunk);

    if (removeResult.error) {
      throw new Error(removeResult.error.message);
    }
  }

  return storageKeys.length;
}

async function listArchiveUserSnapshots() {
  const usersResult = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500
  });

  if (usersResult.error) {
    throw new Error(usersResult.error.message);
  }

  const users = usersResult.data.users ?? [];
  const userIds = users.map((item) => item.id);

  const profilesResult = await supabaseAdmin
    .from("profiles")
    .select("id, role, display_name, is_active")
    .in("id", userIds);

  if (profilesResult.error) {
    throw new Error(profilesResult.error.message);
  }

  const profileMap = new Map(
    ((profilesResult.data ?? []) as Array<{
      id: string;
      role: "citizen" | "moderator" | "admin";
      display_name: string | null;
      is_active: boolean;
    }>).map((item) => [item.id, item])
  );

  return users.map((item) => {
    const profile = profileMap.get(item.id);
    return {
      id: item.id,
      email: item.email ?? null,
      role: profile?.role ?? "citizen",
      displayName: profile?.display_name ?? null,
      isActive: profile?.is_active ?? true
    };
  });
}

async function loadArchiveRows(table: string, columns = "*") {
  const result = await supabaseAdmin.from(table).select(columns);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as unknown as Array<Record<string, unknown>>;
}

async function ensureMaintenanceRestoreTargetIsEmpty() {
  const tableChecks = [
    ["reports", "id"],
    ["report_comments", "id"],
    ["report_media", "id"],
    ["report_status_history", "id"],
    ["report_cleanup_participants", "id"],
    ["cleanup_events", "id"],
    ["report_campaigns", "report_id"],
    ["initiative_submissions", "id"],
    ["initiative_comments", "id"],
    ["campaigns", "id"],
    ["service_areas", "id"],
    ["user_notifications", "id"],
    ["chat_messages", "id"],
    ["moderation_alert_reads", "entity_id"]
  ] as const;

  for (const [table, column] of tableChecks) {
    const count = await countRows(table, column);
    if (count > 0) {
      throw new Error(`Restore requires an empty application dataset. Table ${table} is not empty.`);
    }
  }
}

async function insertRowsInChunks(table: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return 0;
  }

  for (const chunk of chunkArray(rows, 200)) {
    const result = await supabaseAdmin.from(table).insert(chunk);
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  return rows.length;
}

export const adminRouter = Router();

adminRouter.use(authGuard);

adminRouter.get("/users", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const usersResult = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500
  });

  if (usersResult.error) {
    res.status(500).json({
      error: "Failed to load auth users.",
      details: usersResult.error.message
    });
    return;
  }

  const users = usersResult.data.users ?? [];
  const userIds = users.map((user) => user.id);

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, display_name, phone, is_active, approval_status")
    .in("id", userIds);

  if (profilesError) {
    res.status(500).json({
      error: "Failed to load user profiles.",
      details: profilesError.message
    });
    return;
  }

  const profileMap = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
  );

  res.json({
    items: users.map((user) => {
      const profile = profileMap.get(user.id);

      return {
        id: user.id,
        email: user.email ?? null,
        role: profile?.role ?? "citizen",
        displayName:
          profile?.display_name ??
          (user.user_metadata?.nickname as string | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          null,
        phone: profile?.phone ?? null,
        isActive: profile?.is_active ?? true,
        approvalStatus: profile?.approval_status ?? "approved",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null
      };
    })
  });
});

adminRouter.get("/audit", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  try {
    const items = await listAuditLogs(100);
    const profileNames = await loadProfileNamesByIds(
      items.flatMap((item) => [item.actor_user_id ?? "", item.target_user_id ?? ""])
    );

    res.json({
      items: items.map((item) => ({
        id: item.id,
        actorUserId: item.actor_user_id,
        actorDisplayName: profileNames.get(item.actor_user_id ?? "") ?? null,
        actorRole: item.actor_role,
        action: item.action,
        entityType: item.entity_type,
        entityId: item.entity_id,
        reportId: item.report_id,
        targetUserId: item.target_user_id,
        targetDisplayName: profileNames.get(item.target_user_id ?? "") ?? null,
        metadata: item.metadata,
        createdAt: item.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load audit log.",
      details: error instanceof Error ? error.message : "Unknown audit error."
    });
  }
});

adminRouter.patch("/users/:id/role", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsedParams = userIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid user id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  if (parsedParams.data.id === req.authUser?.id) {
    res.status(400).json({ error: "You cannot change your own role here." });
    return;
  }

  const parsedBody = updateRoleSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ role: parsedBody.data.role })
    .eq("id", parsedParams.data.id)
    .select("id, role, display_name, phone, is_active, approval_status")
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update user role.",
      details: error.message
    });
    return;
  }

  await supabaseAdmin.auth.admin.updateUserById(parsedParams.data.id, {
    app_metadata: {
      role: parsedBody.data.role
    }
  });

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "user_role_changed",
    entityType: "user",
    entityId: parsedParams.data.id,
    targetUserId: parsedParams.data.id,
    metadata: {
      role: parsedBody.data.role
    }
  });

  res.json({
    id: data.id,
    role: data.role,
    displayName: data.display_name,
    phone: data.phone,
    isActive: data.is_active,
    approvalStatus: data.approval_status
  });
});

adminRouter.patch("/users/:id/approval", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsedParams = userIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid user id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  if (parsedParams.data.id === req.authUser?.id) {
    res.status(400).json({ error: "You cannot change your own approval state here." });
    return;
  }

  const parsedBody = updateApprovalSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const approvalStatus = parsedBody.data.approvalStatus;
  const isActive = approvalStatus === "approved";

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      approval_status: approvalStatus,
      is_active: isActive
    })
    .eq("id", parsedParams.data.id)
    .select("id, role, display_name, phone, is_active, approval_status")
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update approval state.",
      details: error.message
    });
    return;
  }

  if (approvalStatus === "approved") {
    await supabaseAdmin.from("user_notifications").insert({
      user_id: parsedParams.data.id,
      type: "account_approved",
      title: "Account approved",
      body: "Your profile has been approved by an administrator.",
      metadata: {}
    });
  } else if (approvalStatus === "rejected") {
    await supabaseAdmin.from("user_notifications").insert({
      user_id: parsedParams.data.id,
      type: "account_rejected",
      title: "Account access rejected",
      body: "Your registration was reviewed and access was not approved.",
      metadata: {}
    });
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action:
      approvalStatus === "approved"
        ? "user_approved"
        : approvalStatus === "rejected"
          ? "user_rejected"
          : "user_marked_pending",
    entityType: "user",
    entityId: parsedParams.data.id,
    targetUserId: parsedParams.data.id,
    metadata: {
      approvalStatus,
      isActive
    }
  });

  res.json({
    id: data.id,
    role: data.role,
    displayName: data.display_name,
    phone: data.phone,
    isActive: data.is_active,
    approvalStatus: data.approval_status
  });
});

adminRouter.patch("/users/:id/active", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsedParams = userIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid user id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  if (parsedParams.data.id === req.authUser?.id) {
    res.status(400).json({ error: "You cannot change your own active state here." });
    return;
  }

  const parsedBody = updateActiveSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: parsedBody.data.isActive })
    .eq("id", parsedParams.data.id)
    .select("id, role, display_name, phone, is_active, approval_status")
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update active state.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: parsedBody.data.isActive ? "user_activated" : "user_deactivated",
    entityType: "user",
    entityId: parsedParams.data.id,
    targetUserId: parsedParams.data.id,
    metadata: {
      isActive: parsedBody.data.isActive
    }
  });

  res.json({
    id: data.id,
    role: data.role,
    displayName: data.display_name,
    phone: data.phone,
    isActive: data.is_active,
    approvalStatus: data.approval_status
  });
});

adminRouter.get("/service-areas", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("service_areas")
    .select("id, name, geojson, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    res.status(500).json({
      error: "Failed to load service areas.",
      details: error.message
    });
    return;
  }

  res.json({
    items: ((data ?? []) as ServiceAreaRow[]).map(toServiceAreaResponse)
  });
});

adminRouter.post("/service-areas/geocode", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsed = serviceAreaGeocodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  try {
    const coordinates = await resolveCoordinatesFromInput(parsed.data.query);
    if (!coordinates) {
      res.status(404).json({
        error: "Address could not be resolved."
      });
      return;
    }

    res.json({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to resolve address.",
      details: error instanceof Error ? error.message : "Unknown geocoding error."
    });
  }
});

adminRouter.post("/service-areas", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsed = serviceAreaBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  if (!isValidServiceAreaGeoJson(parsed.data.geojson)) {
    res.status(400).json({
      error: "Invalid GeoJSON polygon."
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("service_areas")
    .insert({
      name: parsed.data.name.trim(),
      geojson: parsed.data.geojson,
      is_active: parsed.data.isActive
    })
    .select("id, name, geojson, is_active, created_at, updated_at")
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to create service area.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "service_area_created",
    entityType: "service_area",
    entityId: data.id,
    metadata: {
      name: data.name,
      isActive: data.is_active
    }
  });

  res.status(201).json(toServiceAreaResponse(data as ServiceAreaRow));
});

adminRouter.patch("/service-areas/:id", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsedParams = serviceAreaIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid service area id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsed = serviceAreaBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  if (!isValidServiceAreaGeoJson(parsed.data.geojson)) {
    res.status(400).json({
      error: "Invalid GeoJSON polygon."
    });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("service_areas")
    .update({
      name: parsed.data.name.trim(),
      geojson: parsed.data.geojson,
      is_active: parsed.data.isActive
    })
    .eq("id", parsedParams.data.id)
    .select("id, name, geojson, is_active, created_at, updated_at")
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update service area.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "service_area_updated",
    entityType: "service_area",
    entityId: data.id,
    metadata: {
      name: data.name,
      isActive: data.is_active
    }
  });

  res.json(toServiceAreaResponse(data as ServiceAreaRow));
});

adminRouter.delete("/service-areas/:id", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsedParams = serviceAreaIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid service area id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const existingResult = await supabaseAdmin
    .from("service_areas")
    .select("id, name, is_active")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (existingResult.error) {
    res.status(500).json({
      error: "Failed to load service area.",
      details: existingResult.error.message
    });
    return;
  }

  if (!existingResult.data) {
    res.status(404).json({
      error: "Service area not found."
    });
    return;
  }

  const { error } = await supabaseAdmin
    .from("service_areas")
    .delete()
    .eq("id", parsedParams.data.id);

  if (error) {
    res.status(500).json({
      error: "Failed to delete service area.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "service_area_deleted",
    entityType: "service_area",
    entityId: parsedParams.data.id,
    metadata: {
      name: existingResult.data.name,
      isActive: existingResult.data.is_active
    }
  });

  res.status(204).send();
});

adminRouter.get("/maintenance/summary", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  try {
    const [users, nonAdminUsers, reports, reportComments, reportMedia, cleanupParticipants, cleanupEvents, initiatives, initiativeComments, campaigns, serviceAreas, notifications, auditLogs] =
      await Promise.all([
        countRows("profiles"),
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .neq("role", "admin")
          .then((result) => {
            if (result.error) {
              throw new Error(result.error.message);
            }
            return result.count ?? 0;
          }),
        countRows("reports"),
        countRows("report_comments"),
        countRows("report_media"),
        countRows("report_cleanup_participants"),
        countRows("cleanup_events"),
        countRows("initiative_submissions"),
        countRows("initiative_comments"),
        countRows("campaigns"),
        countRows("service_areas"),
        countRows("user_notifications"),
        countRows("moderation_audit_log")
      ]);

    res.json({
      counts: {
        users,
        nonAdminUsers,
        reports,
        reportComments,
        reportMedia,
        cleanupParticipants,
        cleanupEvents,
        initiatives,
        initiativeComments,
        campaigns,
        serviceAreas,
        notifications,
        auditLogs
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to load maintenance summary.",
      details: error instanceof Error ? error.message : "Unknown maintenance summary error."
    });
  }
});

adminRouter.get("/maintenance/archive", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  try {
    const [
      userSnapshots,
      serviceAreas,
      campaigns,
      reports,
      reportStatusHistory,
      reportComments,
      cleanupEvents,
      cleanupParticipants,
      reportCampaigns,
      initiatives,
      initiativeComments,
      mediaManifest
    ] = await Promise.all([
      listArchiveUserSnapshots(),
      loadArchiveRows("service_areas", "id, name, geojson, is_active, created_at, updated_at"),
      loadArchiveRows("campaigns", "id, name, description, starts_at, ends_at, status, created_by_user_id, created_at, updated_at"),
      loadArchiveRows("reports", "id, created_by_user_id, source, status, title, description, latitude, longitude, accuracy_meters, address_text, city, country_code, published_at, resolved_at, created_at, updated_at"),
      loadArchiveRows("report_status_history", "id, report_id, from_status, to_status, changed_by_user_id, note, created_at"),
      loadArchiveRows("report_comments", "id, report_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"),
      loadArchiveRows("cleanup_events", "id, report_id, scheduled_at, meeting_address, meeting_latitude, meeting_longitude, instructions_text, tools_note, created_by_user_id, updated_by_user_id, created_at, updated_at"),
      loadArchiveRows("report_cleanup_participants", "id, report_id, user_id, joined_at"),
      loadArchiveRows("report_campaigns", "report_id, campaign_id, assigned_by_user_id, created_at"),
      loadArchiveRows("initiative_submissions", "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"),
      loadArchiveRows("initiative_comments", "id, initiative_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"),
      loadArchiveRows("report_media", "id, report_id, media_type, media_context, storage_key, public_url, thumbnail_url, mime_type, size_bytes, duration_seconds, width_px, height_px, captured_at, uploaded_by_user_id, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at")
    ]);

    const archive: ArchivePayload = {
      format: "cleansea-archive",
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedByUserId: req.authUser?.id ?? null,
      notes: [
        "Archive contains application data snapshots.",
        "Auth users are exported only as reference snapshots and are not automatically restorable.",
        "Media binaries are not embedded in this archive. Only a media manifest is included."
      ],
      userSnapshots,
      data: {
        serviceAreas,
        campaigns,
        reports,
        reportStatusHistory,
        reportComments,
        cleanupEvents,
        cleanupParticipants,
        reportCampaigns,
        initiatives,
        initiativeComments,
        mediaManifest
      }
    };

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: "maintenance_archive_exported",
      entityType: "maintenance",
      metadata: {
        format: archive.format,
        version: archive.version,
        reportCount: reports.length,
        initiativeCount: initiatives.length
      }
    });

    res.json(archive);
  } catch (error) {
    res.status(500).json({
      error: "Failed to export maintenance archive.",
      details: error instanceof Error ? error.message : "Unknown maintenance export error."
    });
  }
});

adminRouter.post("/maintenance/reset", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsed = maintenanceResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  if (parsed.data.confirmation !== "RESET APPLICATION DATA") {
    res.status(400).json({
      error: "Invalid confirmation phrase."
    });
    return;
  }

  try {
    const deleted: Record<string, number> = {};
    const skipped: Record<string, number> = {};

    deleted.reportMediaFiles = await deleteReportMediaStorageFiles();
    deleted.moderationAlertReads = await deleteAllRows("moderation_alert_reads", "entity_id");
    deleted.userNotifications = await deleteAllRows("user_notifications", "id");
    deleted.chatMessages = await deleteAllRows("chat_messages", "id");
    deleted.userChannelIdentities = await deleteAllRows("user_channel_identities", "id");
    deleted.reportCleanupParticipants = await deleteAllRows("report_cleanup_participants", "id");
    deleted.cleanupEvents = await deleteAllRows("cleanup_events", "id");
    deleted.reportComments = await deleteAllRows("report_comments", "id");
    deleted.reportStatusHistory = await deleteAllRows("report_status_history", "id");
    deleted.reportCampaigns = await deleteAllRows("report_campaigns", "report_id");
    deleted.reportMedia = await deleteAllRows("report_media", "id");
    deleted.initiativeComments = await deleteAllRows("initiative_comments", "id");
    deleted.initiatives = await deleteAllRows("initiative_submissions", "id");
    deleted.campaigns = await deleteAllRows("campaigns", "id");
    deleted.serviceAreas = await deleteAllRows("service_areas", "id");
    deleted.reports = await deleteAllRows("reports", "id");
    deleted.auditLogs = await deleteAllRows("moderation_audit_log", "id");

    if (parsed.data.includeUsers) {
      const profilesResult = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .neq("role", "admin")
        .neq("id", req.authUser!.id);

      if (profilesResult.error) {
        throw new Error(profilesResult.error.message);
      }

      const removableUserIds = ((profilesResult.data ?? []) as Array<{ id: string; role: string }>).map(
        (item) => item.id
      );

      for (const userId of removableUserIds) {
        const deleteUserResult = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteUserResult.error) {
          throw new Error(deleteUserResult.error.message);
        }
      }

      deleted.users = removableUserIds.length;
    } else {
      skipped.users = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("role", "admin")
        .then((result) => {
          if (result.error) {
            throw new Error(result.error.message);
          }
          return result.count ?? 0;
        });
    }

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: "maintenance_reset_completed",
      entityType: "maintenance",
      metadata: {
        includeUsers: parsed.data.includeUsers,
        deleted,
        skipped
      }
    });

    res.json({ deleted, skipped });
  } catch (error) {
    res.status(500).json({
      error: "Failed to reset application data.",
      details: error instanceof Error ? error.message : "Unknown maintenance reset error."
    });
  }
});

adminRouter.post("/maintenance/restore", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsed = maintenanceRestoreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  if (parsed.data.confirmation !== "RESTORE APPLICATION DATA") {
    res.status(400).json({
      error: "Invalid confirmation phrase."
    });
    return;
  }

  const archive = parsed.data.archive as Partial<ArchivePayload>;
  if (archive.format !== "cleansea-archive" || archive.version !== 1 || !archive.data) {
    res.status(400).json({
      error: "Invalid archive format."
    });
    return;
  }

  try {
    await ensureMaintenanceRestoreTargetIsEmpty();

    const existingUserIds = await loadAuthUserIds();
    const restored: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const warnings: string[] = [];

    restored.serviceAreas = await insertRowsInChunks(
      "service_areas",
      (archive.data.serviceAreas ?? []) as Array<Record<string, unknown>>
    );

    restored.campaigns = await insertRowsInChunks(
      "campaigns",
      ((archive.data.campaigns ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        created_by_user_id: normalizeNullableUserId(item.created_by_user_id, existingUserIds)
      }))
    );

    restored.reports = await insertRowsInChunks(
      "reports",
      ((archive.data.reports ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        created_by_user_id: normalizeNullableUserId(item.created_by_user_id, existingUserIds),
        location: buildReportLocationWkt(
          typeof item.latitude === "number" ? item.latitude : null,
          typeof item.longitude === "number" ? item.longitude : null
        )
      }))
    );

    restored.reportCampaigns = await insertRowsInChunks(
      "report_campaigns",
      ((archive.data.reportCampaigns ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        assigned_by_user_id: normalizeNullableUserId(item.assigned_by_user_id, existingUserIds)
      }))
    );

    restored.cleanupEvents = await insertRowsInChunks(
      "cleanup_events",
      ((archive.data.cleanupEvents ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        created_by_user_id: normalizeNullableUserId(item.created_by_user_id, existingUserIds),
        updated_by_user_id: normalizeNullableUserId(item.updated_by_user_id, existingUserIds)
      }))
    );

    restored.reportStatusHistory = await insertRowsInChunks(
      "report_status_history",
      ((archive.data.reportStatusHistory ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        changed_by_user_id: normalizeNullableUserId(item.changed_by_user_id, existingUserIds)
      }))
    );

    restored.reportComments = await insertRowsInChunks(
      "report_comments",
      ((archive.data.reportComments ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        author_user_id: normalizeNullableUserId(item.author_user_id, existingUserIds),
        hidden_by_user_id: normalizeNullableUserId(item.hidden_by_user_id, existingUserIds)
      }))
    );

    const cleanupParticipantsSource = (archive.data.cleanupParticipants ?? []) as Array<Record<string, unknown>>;
    const cleanupParticipantsRestorable = cleanupParticipantsSource.filter(
      (item) => typeof item.user_id === "string" && existingUserIds.has(item.user_id)
    );
    skipped.cleanupParticipants = cleanupParticipantsSource.length - cleanupParticipantsRestorable.length;
    restored.cleanupParticipants = await insertRowsInChunks(
      "report_cleanup_participants",
      cleanupParticipantsRestorable
    );

    restored.initiatives = await insertRowsInChunks(
      "initiative_submissions",
      ((archive.data.initiatives ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        submitter_user_id: normalizeNullableUserId(item.submitter_user_id, existingUserIds),
        reviewed_by_user_id: normalizeNullableUserId(item.reviewed_by_user_id, existingUserIds),
        plan_updated_by_user_id: normalizeNullableUserId(item.plan_updated_by_user_id, existingUserIds),
        report_updated_by_user_id: normalizeNullableUserId(item.report_updated_by_user_id, existingUserIds)
      }))
    );

    restored.initiativeComments = await insertRowsInChunks(
      "initiative_comments",
      ((archive.data.initiativeComments ?? []) as Array<Record<string, unknown>>).map((item) => ({
        ...item,
        author_user_id: normalizeNullableUserId(item.author_user_id, existingUserIds),
        hidden_by_user_id: normalizeNullableUserId(item.hidden_by_user_id, existingUserIds)
      }))
    );

    skipped.mediaManifest = ((archive.data.mediaManifest ?? []) as Array<Record<string, unknown>>).length;
    if (skipped.mediaManifest > 0) {
      warnings.push(
        "Media files are not restored automatically. The archive contains only a media manifest."
      );
    }

    warnings.push(
      "Auth users are not recreated from the archive. User-linked records are restored only when the referenced user already exists."
    );

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: "maintenance_restore_completed",
      entityType: "maintenance",
      metadata: {
        restored,
        skipped,
        warnings
      }
    });

    res.json({ restored, skipped, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown maintenance restore error.";
    const status = message.includes("requires an empty application dataset") ? 409 : 500;
    res.status(status).json({
      error: "Failed to restore maintenance archive.",
      details: message
    });
  }
});

adminRouter.post("/maintenance/delete-entity", async (req, res) => {
  if (!requireAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsed = maintenanceDeleteEntitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { entityType, entityId } = parsed.data;

  try {
    if (entityType === "user") {
      if (entityId === req.authUser!.id) {
        res.status(400).json({ error: "You cannot delete your own admin account here." });
        return;
      }

      const profileResult = await supabaseAdmin
        .from("profiles")
        .select("id, role, display_name")
        .eq("id", entityId)
        .maybeSingle();

      if (profileResult.error) {
        throw new Error(profileResult.error.message);
      }

      if (!profileResult.data) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      if (profileResult.data.role === "admin") {
        res.status(400).json({ error: "Deleting another admin is blocked here." });
        return;
      }

      const deleteUserResult = await supabaseAdmin.auth.admin.deleteUser(entityId);
      if (deleteUserResult.error) {
        throw new Error(deleteUserResult.error.message);
      }

      await writeAuditLog({
        actorUserId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: "maintenance_user_deleted",
        entityType: "user",
        entityId,
        targetUserId: entityId,
        metadata: {
          displayName: profileResult.data.display_name
        }
      });

      res.status(204).send();
      return;
    }

    if (entityType === "report") {
      const mediaResult = await supabaseAdmin
        .from("report_media")
        .select("storage_key")
        .eq("report_id", entityId);

      if (mediaResult.error) {
        throw new Error(mediaResult.error.message);
      }

      const storageKeys = ((mediaResult.data ?? []) as Array<{ storage_key: string | null }>)
        .map((item) => item.storage_key)
        .filter((item): item is string => Boolean(item));

      for (const chunk of chunkArray(storageKeys, 100)) {
        const removeResult = await supabaseAdmin.storage
          .from(env.REPORT_MEDIA_BUCKET)
          .remove(chunk);

        if (removeResult.error) {
          throw new Error(removeResult.error.message);
        }
      }

      const deleteResult = await supabaseAdmin
        .from("reports")
        .delete()
        .eq("id", entityId);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }

      await writeAuditLog({
        actorUserId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: "maintenance_report_deleted",
        entityType: "report",
        entityId,
        metadata: {
          deletedMediaFiles: storageKeys.length
        }
      });

      res.status(204).send();
      return;
    }

    if (entityType === "initiative") {
      const deleteResult = await supabaseAdmin
        .from("initiative_submissions")
        .delete()
        .eq("id", entityId);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }

      await writeAuditLog({
        actorUserId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: "maintenance_initiative_deleted",
        entityType: "initiative",
        entityId
      });

      res.status(204).send();
      return;
    }

    if (entityType === "campaign") {
      const deleteResult = await supabaseAdmin
        .from("campaigns")
        .delete()
        .eq("id", entityId);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }

      await writeAuditLog({
        actorUserId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: "maintenance_campaign_deleted",
        entityType: "campaign",
        entityId
      });

      res.status(204).send();
      return;
    }

    if (entityType === "service_area") {
      const deleteResult = await supabaseAdmin
        .from("service_areas")
        .delete()
        .eq("id", entityId);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }

      await writeAuditLog({
        actorUserId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: "maintenance_service_area_deleted",
        entityType: "service_area",
        entityId
      });

      res.status(204).send();
      return;
    }

    res.status(400).json({ error: "Unsupported entity type." });
  } catch (error) {
    res.status(500).json({
      error: "Failed to delete entity.",
      details: error instanceof Error ? error.message : "Unknown maintenance delete error."
    });
  }
});
