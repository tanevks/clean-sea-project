import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authGuard } from "../middleware/authGuard";
import {
  buildStorageKey,
  ensureReportMediaBucket,
  reportMediaTypeSchema
} from "../lib/reportMedia";
import { env } from "../lib/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const presignUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  mediaType: reportMediaTypeSchema,
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024)
});

export const uploadsRouter = Router();

uploadsRouter.post("/presign", authGuard, async (req, res) => {
  const parsed = presignUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid body.",
      details: parsed.error.flatten()
    });
    return;
  }

  const { fileName, contentType, mediaType, sizeBytes } = parsed.data;
  const expectedPrefix = mediaType === "image" ? "image/" : "video/";
  if (!contentType.toLowerCase().startsWith(expectedPrefix)) {
    res.status(400).json({
      error: `contentType must start with ${expectedPrefix}`
    });
    return;
  }

  try {
    await ensureReportMediaBucket();
  } catch (error) {
    res.status(500).json({
      error: "Failed to prepare report media bucket.",
      details: error instanceof Error ? error.message : "Unknown storage error."
    });
    return;
  }

  const storageKey = buildStorageKey(req.authUser!.id, fileName);
  const uploadId = randomUUID();
  const signedUpload = await supabaseAdmin.storage
    .from(env.REPORT_MEDIA_BUCKET)
    .createSignedUploadUrl(storageKey);

  if (signedUpload.error || !signedUpload.data) {
    res.status(500).json({
      error: "Failed to create signed upload URL.",
      details: signedUpload.error?.message ?? "Missing signed upload data."
    });
    return;
  }

  res.json({
    uploadId,
    bucket: env.REPORT_MEDIA_BUCKET,
    storageKey,
    uploadUrl: signedUpload.data.signedUrl,
    uploadToken: signedUpload.data.token,
    contentType,
    mediaType,
    sizeBytes
  });
});
