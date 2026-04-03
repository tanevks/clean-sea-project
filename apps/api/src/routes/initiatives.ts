import { Router } from "express";
import { z } from "zod";
import { writeAuditLog } from "../lib/auditLog";
import { notifyInitiativeParticipants } from "../lib/initiativeParticipantNotifications";
import { authGuard } from "../middleware/authGuard";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const createInitiativeSchema = z.object({
  submitterName: z.string().trim().min(2).max(120),
  submitterEmail: z.string().trim().email().max(240),
  submitterPhone: z.string().trim().max(60).optional().or(z.literal("")),
  category: z.enum(["idea", "initiative"]),
  title: z.string().trim().min(5).max(180),
  description: z.string().trim().min(20).max(4000)
});

const listInitiativesSchema = z.object({
  status: z.enum(["new", "approved", "rejected", "published", "executed", "inactive"]).optional()
});

const initiativeIdSchema = z.object({
  id: z.string().uuid()
});

const commentIdSchema = z.object({
  id: z.string().uuid(),
  commentId: z.string().uuid()
});

const updateInitiativeSchema = z
  .object({
    status: z
      .enum(["approved", "rejected", "published", "executed", "inactive"])
      .optional(),
    reviewNote: z.string().trim().max(1500).optional().or(z.literal("")),
    implementationPlan: z.string().max(10000).optional().or(z.literal("")),
    implementationReport: z.string().max(10000).optional().or(z.literal(""))
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.reviewNote !== undefined ||
      value.implementationPlan !== undefined ||
      value.implementationReport !== undefined,
    {
      message: "At least one field is required."
    }
  );

const commentVisibilitySchema = z.enum(["public", "internal"]);

const createCommentSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  visibility: commentVisibilitySchema.optional().default("internal")
});

const moderateCommentSchema = z.object({
  isHidden: z.boolean(),
  reason: z.string().trim().min(1).max(500).optional()
});

type InitiativeRow = {
  id: string;
  submitter_user_id: string | null;
  submitter_name: string;
  submitter_email: string;
  submitter_phone: string | null;
  category: "idea" | "initiative";
  title: string;
  description: string;
  status: "new" | "approved" | "rejected" | "published" | "executed" | "inactive";
  review_note: string | null;
  reviewed_by_user_id: string | null;
  implementation_plan: string | null;
  implementation_report: string | null;
  plan_updated_at: string | null;
  report_updated_at: string | null;
  plan_updated_by_user_id: string | null;
  report_updated_by_user_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type InitiativeCommentRow = {
  id: string;
  initiative_id: string;
  author_user_id: string | null;
  visibility: "public" | "internal";
  message: string;
  is_hidden: boolean;
  hidden_at: string | null;
  hidden_by_user_id: string | null;
  hidden_reason: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type InitiativeCommentSummary = {
  publicCommentCount: number;
  latestPublicCommentAt: string | null;
};

function requireModerator(role: "citizen" | "moderator" | "admin" | undefined) {
  return role === "moderator" || role === "admin";
}

function isAdmin(role: "citizen" | "moderator" | "admin" | undefined) {
  return role === "admin";
}

function isPublicInitiativeStatus(status: InitiativeRow["status"]) {
  return status === "approved" || status === "published" || status === "executed";
}

function toInitiativeResponse(item: InitiativeRow) {
  return {
    id: item.id,
    submitterUserId: item.submitter_user_id,
    submitterName: item.submitter_name,
    submitterEmail: item.submitter_email,
    submitterPhone: item.submitter_phone,
    category: item.category,
    title: item.title,
    description: item.description,
    status: item.status,
    reviewNote: item.review_note,
    reviewedByUserId: item.reviewed_by_user_id,
    implementationPlan: item.implementation_plan,
    implementationReport: item.implementation_report,
    planUpdatedAt: item.plan_updated_at,
    reportUpdatedAt: item.report_updated_at,
    planUpdatedByUserId: item.plan_updated_by_user_id,
    reportUpdatedByUserId: item.report_updated_by_user_id,
    publishedAt: item.published_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

function canAccessInitiativeComments(
  role: "citizen" | "moderator" | "admin" | undefined,
  initiative: InitiativeRow
) {
  if (role === "admin") {
    return true;
  }

  if (role === "moderator") {
    return initiative.status !== "inactive";
  }

  return isPublicInitiativeStatus(initiative.status);
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
    ((data ?? []) as ProfileRow[]).map((item) => [item.id, item.display_name])
  );
}

function toCommentResponse(
  item: InitiativeCommentRow,
  displayName: string | null | undefined
) {
  return {
    id: item.id,
    authorUserId: item.author_user_id,
    authorDisplayName: displayName ?? null,
    visibility: item.visibility,
    message: item.message,
    isHidden: item.is_hidden,
    hiddenAt: item.hidden_at,
    hiddenByUserId: item.hidden_by_user_id,
    hiddenReason: item.hidden_reason,
    createdAt: item.created_at
  };
}

async function loadPublicCommentSummaryByInitiativeIds(initiativeIds: string[]) {
  const uniqueIds = [...new Set(initiativeIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map<string, InitiativeCommentSummary>();
  }

  const { data, error } = await supabaseAdmin
    .from("initiative_comments")
    .select("initiative_id, created_at")
    .in("initiative_id", uniqueIds)
    .eq("visibility", "public")
    .eq("is_hidden", false);

  if (error) {
    throw new Error(error.message);
  }

  const summaryMap = new Map<string, InitiativeCommentSummary>();
  for (const item of (data ?? []) as Array<{
    initiative_id: string;
    created_at: string;
  }>) {
    const current = summaryMap.get(item.initiative_id) ?? {
      publicCommentCount: 0,
      latestPublicCommentAt: null
    };

    current.publicCommentCount += 1;
    if (
      !current.latestPublicCommentAt ||
      new Date(item.created_at).getTime() > new Date(current.latestPublicCommentAt).getTime()
    ) {
      current.latestPublicCommentAt = item.created_at;
    }

    summaryMap.set(item.initiative_id, current);
  }

  return summaryMap;
}

export const initiativesRouter = Router();

function toValidationDetails(flattened: {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
}) {
  const firstFieldEntry = Object.entries(flattened.fieldErrors).find(
    ([, value]) => Array.isArray(value) && value.length > 0
  );

  if (firstFieldEntry) {
    const [field, value] = firstFieldEntry;
    return {
      formErrors: flattened.formErrors,
      fieldErrors: flattened.fieldErrors,
      message: `${field}: ${value?.[0] ?? "Invalid value."}`
    };
  }

  if (flattened.formErrors[0]) {
    return {
      formErrors: flattened.formErrors,
      fieldErrors: flattened.fieldErrors,
      message: flattened.formErrors[0]
    };
  }

  return {
    formErrors: flattened.formErrors,
    fieldErrors: flattened.fieldErrors,
    message: "Invalid input."
  };
}

async function getOptionalAuthUserId(authorizationHeader?: string) {
  const token = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return null;
  }

  const result = await supabaseAdmin.auth.getUser(token);
  if (result.error || !result.data.user) {
    return null;
  }

  return result.data.user.id;
}

initiativesRouter.get("/public", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("initiative_submissions")
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .in("status", ["approved", "published", "executed"])
    .order("published_at", { ascending: false })
    .limit(20);

  if (error) {
    res.status(500).json({
      error: "Failed to load published initiatives.",
      details: error.message
    });
    return;
  }

  try {
    const rows = (data ?? []) as InitiativeRow[];
    const commentSummaryByInitiativeId = await loadPublicCommentSummaryByInitiativeIds(
      rows.map((item) => item.id)
    );

    res.json({
      items: rows.map((item) => ({
        id: item.id,
        submitterName: item.submitter_name,
        category: item.category,
        title: item.title,
        description: item.description,
        status: item.status,
        implementationPlan: item.implementation_plan,
        implementationReport: item.implementation_report,
        planUpdatedAt: item.plan_updated_at,
        reportUpdatedAt: item.report_updated_at,
        publishedAt: item.published_at,
        createdAt: item.created_at,
        commentSummary: commentSummaryByInitiativeId.get(item.id) ?? {
          publicCommentCount: 0,
          latestPublicCommentAt: null
        }
      }))
    });
  } catch (summaryError) {
    res.status(500).json({
      error: "Failed to enrich published initiatives.",
      details:
        summaryError instanceof Error ? summaryError.message : "Unknown summary error."
    });
  }
});

initiativesRouter.post("/public", async (req, res) => {
  const parsed = createInitiativeSchema.safeParse(req.body);
  if (!parsed.success) {
    const details = toValidationDetails(parsed.error.flatten());
    res.status(400).json({
      error: "Invalid body.",
      details
    });
    return;
  }

  const payload = parsed.data;
  const submitterUserId = await getOptionalAuthUserId(req.headers.authorization);
  const { data, error } = await supabaseAdmin
    .from("initiative_submissions")
    .insert({
      submitter_user_id: submitterUserId,
      submitter_name: payload.submitterName,
      submitter_email: payload.submitterEmail,
      submitter_phone: payload.submitterPhone?.trim() || null,
      category: payload.category,
      title: payload.title,
      description: payload.description,
      status: "new"
    })
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to submit initiative.",
      details: error.message
    });
    return;
  }

  res.status(201).json(toInitiativeResponse(data as InitiativeRow));
});

initiativesRouter.get("/public/:id/comments", async (req, res) => {
  const parsedParams = initiativeIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid initiative id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const initiativeResult = await supabaseAdmin
    .from("initiative_submissions")
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (initiativeResult.error) {
    res.status(500).json({
      error: "Failed to load initiative.",
      details: initiativeResult.error.message
    });
    return;
  }

  if (
    !initiativeResult.data ||
    !isPublicInitiativeStatus((initiativeResult.data as InitiativeRow).status)
  ) {
    res.status(404).json({ error: "Initiative not found." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("initiative_comments")
    .select(
      "id, initiative_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .eq("initiative_id", parsedParams.data.id)
    .eq("visibility", "public")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({
      error: "Failed to fetch initiative comments.",
      details: error.message
    });
    return;
  }

  try {
    const rows = (data ?? []) as InitiativeCommentRow[];
    const profileNames = await loadProfileNamesByIds(
      rows.map((item) => item.author_user_id ?? "")
    );

    res.json({
      items: rows.map((item) =>
        toCommentResponse(item, profileNames.get(item.author_user_id ?? ""))
      )
    });
  } catch (commentError) {
    res.status(500).json({
      error: "Failed to enrich initiative comments.",
      details:
        commentError instanceof Error ? commentError.message : "Unknown comment error."
    });
  }
});

initiativesRouter.use(authGuard);

initiativesRouter.get("/:id/comments", async (req, res) => {
  const parsedParams = initiativeIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid initiative id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const initiativeResult = await supabaseAdmin
    .from("initiative_submissions")
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (initiativeResult.error) {
    res.status(500).json({
      error: "Failed to load initiative.",
      details: initiativeResult.error.message
    });
    return;
  }

  if (
    !initiativeResult.data ||
    !canAccessInitiativeComments(req.authUser?.role, initiativeResult.data as InitiativeRow)
  ) {
    res.status(404).json({ error: "Initiative not found." });
    return;
  }

  let query = supabaseAdmin
    .from("initiative_comments")
    .select(
      "id, initiative_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .eq("initiative_id", parsedParams.data.id)
    .order("created_at", { ascending: false });

  if (!requireModerator(req.authUser?.role)) {
    query = query.eq("visibility", "public").eq("is_hidden", false);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({
      error: "Failed to fetch initiative comments.",
      details: error.message
    });
    return;
  }

  try {
    const rows = (data ?? []) as InitiativeCommentRow[];
    const profileNames = await loadProfileNamesByIds(
      rows.map((item) => item.author_user_id ?? "")
    );

    res.json({
      items: rows.map((item) =>
        toCommentResponse(item, profileNames.get(item.author_user_id ?? ""))
      )
    });
  } catch (commentError) {
    res.status(500).json({
      error: "Failed to enrich initiative comments.",
      details:
        commentError instanceof Error ? commentError.message : "Unknown comment error."
    });
  }
});

initiativesRouter.post("/:id/comments", async (req, res) => {
  const parsedParams = initiativeIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid initiative id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = createCommentSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const initiativeResult = await supabaseAdmin
    .from("initiative_submissions")
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (initiativeResult.error) {
    res.status(500).json({
      error: "Failed to load initiative.",
      details: initiativeResult.error.message
    });
    return;
  }

  if (
    !initiativeResult.data ||
    !canAccessInitiativeComments(req.authUser?.role, initiativeResult.data as InitiativeRow)
  ) {
    res.status(404).json({ error: "Initiative not found." });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("initiative_comments")
    .insert({
      initiative_id: parsedParams.data.id,
      author_user_id: req.authUser!.id,
      visibility: requireModerator(req.authUser?.role)
        ? parsedBody.data.visibility
        : "public",
      message: parsedBody.data.message
    })
    .select(
      "id, initiative_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to create initiative comment.",
      details: error.message
    });
    return;
  }

  try {
    const profileNames = await loadProfileNamesByIds([
      data.author_user_id ?? req.authUser!.id
    ]);
    const initiativeRow = initiativeResult.data as InitiativeRow;

    if ((data as InitiativeCommentRow).visibility === "public") {
      await notifyInitiativeParticipants({
        type: "initiative_public_comment",
        initiative: initiativeRow,
        comment: data as InitiativeCommentRow
      });
    }

    res.status(201).json(
      toCommentResponse(
        data as InitiativeCommentRow,
        profileNames.get(data.author_user_id ?? req.authUser!.id)
      )
    );
  } catch (commentError) {
    res.status(500).json({
      error: "Comment created, but failed to enrich author information.",
      details:
        commentError instanceof Error ? commentError.message : "Unknown comment error."
    });
  }
});

initiativesRouter.get("/meta", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const { count: newCount, error } = await supabaseAdmin
    .from("initiative_submissions")
    .select("*", { count: "exact", head: true })
    .eq("status", "new");

  if (error) {
    res.status(500).json({
      error: "Failed to load initiative meta.",
      details: error.message
    });
    return;
  }

  res.json({
    newCount: newCount ?? 0
  });
});

initiativesRouter.get("/", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsed = listInitiativesSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query params.",
      details: parsed.error.flatten()
    });
    return;
  }

  let query = supabaseAdmin
    .from("initiative_submissions")
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }

  if (req.authUser?.role === "moderator") {
    query = query.neq("status", "inactive");
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({
      error: "Failed to load initiatives.",
      details: error.message
    });
    return;
  }

  res.json({
    items: ((data ?? []) as InitiativeRow[]).map(toInitiativeResponse)
  });
});

initiativesRouter.patch("/:id", async (req, res) => {
  if (!isAdmin(req.authUser?.role)) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }

  const parsedParams = initiativeIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid initiative id.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = updateInitiativeSchema.safeParse(req.body);
  if (!parsedBody.success) {
    const details = toValidationDetails(parsedBody.error.flatten());
    res.status(400).json({
      error: "Invalid body.",
      details
    });
    return;
  }

  const currentResult = await supabaseAdmin
    .from("initiative_submissions")
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (currentResult.error) {
    res.status(500).json({
      error: "Failed to load initiative.",
      details: currentResult.error.message
    });
    return;
  }

  if (!currentResult.data) {
    res.status(404).json({ error: "Initiative not found." });
    return;
  }

  const current = currentResult.data as InitiativeRow;
  const nextStatus = parsedBody.data.status ?? current.status;
  const nextReviewNote =
    parsedBody.data.reviewNote !== undefined
      ? parsedBody.data.reviewNote?.trim() || null
      : current.review_note;
  const nextImplementationPlan =
    parsedBody.data.implementationPlan !== undefined
      ? parsedBody.data.implementationPlan?.trim() || null
      : current.implementation_plan;
  const nextImplementationReport =
    parsedBody.data.implementationReport !== undefined
      ? parsedBody.data.implementationReport?.trim() || null
      : current.implementation_report;

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    review_note: nextReviewNote,
    reviewed_by_user_id: req.authUser!.id,
    published_at:
      current.published_at ?? (isPublicInitiativeStatus(nextStatus) ? nowIso : null)
  };

  if (parsedBody.data.implementationPlan !== undefined) {
    updatePayload.implementation_plan = nextImplementationPlan;
    updatePayload.plan_updated_at = nextImplementationPlan ? nowIso : null;
    updatePayload.plan_updated_by_user_id = nextImplementationPlan ? req.authUser!.id : null;
  }

  if (parsedBody.data.implementationReport !== undefined) {
    updatePayload.implementation_report = nextImplementationReport;
    updatePayload.report_updated_at = nextImplementationReport ? nowIso : null;
    updatePayload.report_updated_by_user_id = nextImplementationReport ? req.authUser!.id : null;
  }

  const { data, error } = await supabaseAdmin
    .from("initiative_submissions")
    .update(updatePayload)
    .eq("id", parsedParams.data.id)
    .select(
      "id, submitter_user_id, submitter_name, submitter_email, submitter_phone, category, title, description, status, review_note, reviewed_by_user_id, implementation_plan, implementation_report, plan_updated_at, report_updated_at, plan_updated_by_user_id, report_updated_by_user_id, published_at, created_at, updated_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to update initiative.",
      details: error.message
    });
    return;
  }

  await writeAuditLog({
    actorUserId: req.authUser!.id,
    actorRole: req.authUser!.role,
    action: "initiative_status_changed",
    entityType: "initiative_submission",
    entityId: parsedParams.data.id,
    metadata: {
      status: nextStatus,
      reviewNote: nextReviewNote,
      planUpdated: parsedBody.data.implementationPlan !== undefined,
      reportUpdated: parsedBody.data.implementationReport !== undefined
    }
  });

  const updated = data as InitiativeRow;
  const planBecameReady =
    parsedBody.data.implementationPlan !== undefined &&
    Boolean(updated.implementation_plan) &&
    updated.implementation_plan !== current.implementation_plan;
  const reportBecameReady =
    parsedBody.data.implementationReport !== undefined &&
    Boolean(updated.implementation_report) &&
    updated.implementation_report !== current.implementation_report;

  if (planBecameReady) {
    await notifyInitiativeParticipants({
      type: "initiative_plan_ready",
      initiative: updated,
      actorUserId: req.authUser!.id
    });
  }

  if (reportBecameReady) {
    await notifyInitiativeParticipants({
      type: "initiative_report_ready",
      initiative: updated,
      actorUserId: req.authUser!.id
    });
  }

  res.json(toInitiativeResponse(data as InitiativeRow));
});

initiativesRouter.patch("/:id/comments/:commentId/moderation", async (req, res) => {
  if (!requireModerator(req.authUser?.role)) {
    res.status(403).json({ error: "Moderator access is required." });
    return;
  }

  const parsedParams = commentIdSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      error: "Invalid ids.",
      details: parsedParams.error.flatten()
    });
    return;
  }

  const parsedBody = moderateCommentSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsedBody.error.flatten()
    });
    return;
  }

  const existing = await supabaseAdmin
    .from("initiative_comments")
    .select(
      "id, initiative_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .eq("id", parsedParams.data.commentId)
    .eq("initiative_id", parsedParams.data.id)
    .single();

  if (existing.error) {
    res.status(500).json({
      error: "Failed to load initiative comment.",
      details: existing.error.message
    });
    return;
  }

  const updatePayload = parsedBody.data.isHidden
    ? {
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_by_user_id: req.authUser!.id,
        hidden_reason: parsedBody.data.reason ?? null
      }
    : {
        is_hidden: false,
        hidden_at: null,
        hidden_by_user_id: null,
        hidden_reason: null
      };

  const { data, error } = await supabaseAdmin
    .from("initiative_comments")
    .update(updatePayload)
    .eq("id", parsedParams.data.commentId)
    .eq("initiative_id", parsedParams.data.id)
    .select(
      "id, initiative_id, author_user_id, visibility, message, is_hidden, hidden_at, hidden_by_user_id, hidden_reason, created_at"
    )
    .single();

  if (error) {
    res.status(500).json({
      error: "Failed to moderate initiative comment.",
      details: error.message
    });
    return;
  }

  try {
    const profileNames = await loadProfileNamesByIds([
      data.author_user_id ?? "",
      data.hidden_by_user_id ?? ""
    ]);

    await writeAuditLog({
      actorUserId: req.authUser!.id,
      actorRole: req.authUser!.role,
      action: parsedBody.data.isHidden
        ? "initiative_comment_hidden"
        : "initiative_comment_unhidden",
      entityType: "initiative_comment",
      entityId: parsedParams.data.commentId,
      metadata: {
        initiativeId: parsedParams.data.id,
        isHidden: parsedBody.data.isHidden,
        reason: parsedBody.data.reason ?? null
      }
    });

    res.json(
      toCommentResponse(
        data as InitiativeCommentRow,
        profileNames.get(data.author_user_id ?? "")
      )
    );
  } catch (commentError) {
    res.status(500).json({
      error: "Comment updated, but failed to enrich author information.",
      details:
        commentError instanceof Error ? commentError.message : "Unknown comment error."
    });
  }
});
