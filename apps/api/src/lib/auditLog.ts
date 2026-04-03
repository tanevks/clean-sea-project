import { supabaseAdmin } from "./supabaseAdmin";
import type { UserRole } from "../types/auth";

export type AuditLogInput = {
  actorUserId: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId?: string | null;
  reportId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  actor_role: UserRole;
  action: string;
  entity_type: string;
  entity_id: string | null;
  report_id: string | null;
  target_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function writeAuditLog(input: AuditLogInput) {
  const { error } = await supabaseAdmin.from("moderation_audit_log").insert({
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    report_id: input.reportId ?? null,
    target_user_id: input.targetUserId ?? null,
    metadata: input.metadata ?? {}
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function listAuditLogs(limit = 100) {
  const { data, error } = await supabaseAdmin
    .from("moderation_audit_log")
    .select(
      "id, actor_user_id, actor_role, action, entity_type, entity_id, report_id, target_user_id, metadata, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AuditLogRow[];
}
