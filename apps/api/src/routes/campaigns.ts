import { Router } from "express";
import { z } from "zod";
import { writeAuditLog } from "../lib/auditLog";
import { authGuard } from "../middleware/authGuard";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const campaignSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  status: z.enum(["draft", "active", "completed"])
});

const campaignIdSchema = z.object({
  id: z.string().uuid()
});

type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: "draft" | "active" | "completed";
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function requireModerator(role: "citizen" | "moderator" | "admin" | undefined) {
  return role === "moderator" || role === "admin";
}

function toCampaignResponse(item: CampaignRow) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    status: item.status,
    createdByUserId: item.created_by_user_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

export const campaignsRouter = Router();

campaignsRouter.get("/public", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, name, description, starts_at, ends_at, status, created_by_user_id, created_at, updated_at"
    )
    .in("status", ["active", "completed"])
    .order("starts_at", { ascending: false });

  if (error) {
    res.status(500).json({
      error: "Failed to load campaigns.",
      details: error.message
    });
    return;
  }

  res.json({ items: ((data ?? []) as CampaignRow[]).map(toCampaignResponse) });
});

campaignsRouter.use(authGuard);

campaignsRouter.get("/", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select(
      "id, name, description, starts_at, ends_at, status, created_by_user_id, created_at, updated_at"
    )
    .order("starts_at", { ascending: false });

  if (error) {
    res.status(500).json({
      error: "Failed to load campaigns.",
      details: error.message
    });
    return;
  }

  res.json({ items: ((data ?? []) as CampaignRow[]).map(toCampaignResponse) });
});

campaignsRouter.post("/", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  const payload = parsed.data;
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .insert({
      name: payload.name,
      description: payload.description?.trim() || null,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      status: payload.status,
      created_by_user_id: req.authUser!.id
    })
    .select(
      "id, name, description, starts_at, ends_at, status, created_by_user_id, created_at, updated_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to create campaign.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "campaign_created",
    entityType: "campaign",
    entityId: (data as CampaignRow).id,
    metadata: {
      name: payload.name,
      status: payload.status
    }
  });

  res.status(201).json(toCampaignResponse(data as CampaignRow));
});

campaignsRouter.patch("/:id", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsedParams = campaignIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid campaign id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = campaignSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const payload = parsedBody.data;
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .update({
      name: payload.name,
      description: payload.description?.trim() || null,
      starts_at: payload.startsAt,
      ends_at: payload.endsAt,
      status: payload.status
    })
    .eq("id", parsedParams.data.id)
    .select(
      "id, name, description, starts_at, ends_at, status, created_by_user_id, created_at, updated_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update campaign.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "campaign_updated",
    entityType: "campaign",
    entityId: parsedParams.data.id,
    metadata: {
      name: payload.name,
      status: payload.status
    }
  });

  res.json(toCampaignResponse(data as CampaignRow));
});
