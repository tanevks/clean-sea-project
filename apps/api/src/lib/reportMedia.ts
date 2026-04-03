import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "./env";
import { supabaseAdmin } from "./supabaseAdmin";

export const reportMediaTypeSchema = z.enum(["image", "video"]);

export const createReportMediaSchema = z.object({
  storageKey: z.string().min(1).max(500),
  mediaType: reportMediaTypeSchema,
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
  widthPx: z.number().int().min(1).optional(),
  heightPx: z.number().int().min(1).optional(),
  durationSeconds: z.number().int().min(1).optional()
});

export type CreateReportMedia = z.infer<typeof createReportMediaSchema>;

export const reportMediaBucketOptions = {
  public: true,
  fileSizeLimit: 50 * 1024 * 1024,
  allowedMimeTypes: ["image/*", "video/*"] as string[]
};

export async function ensureReportMediaBucket() {
  const existingBucket = await supabaseAdmin.storage.getBucket(env.REPORT_MEDIA_BUCKET);
  if (!existingBucket.error) {
    return;
  }

  const missingBucket =
    existingBucket.error.message.toLowerCase().includes("not found") ||
    existingBucket.error.message.toLowerCase().includes("does not exist");

  if (!missingBucket) {
    throw new Error(existingBucket.error.message);
  }

  const createdBucket = await supabaseAdmin.storage.createBucket(
    env.REPORT_MEDIA_BUCKET,
    reportMediaBucketOptions
  );

  if (createdBucket.error) {
    throw new Error(createdBucket.error.message);
  }
}

export function buildStorageKey(userId: string, fileName: string) {
  const today = new Date().toISOString().slice(0, 10);
  const safeFileName = sanitizeFileName(fileName);
  return `${userId}/${today}/${randomUUID()}-${safeFileName}`;
}

export function getReportMediaPublicUrl(storageKey: string) {
  const { data } = supabaseAdmin.storage
    .from(env.REPORT_MEDIA_BUCKET)
    .getPublicUrl(storageKey);

  return data.publicUrl;
}

function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim();
  const fallback = `upload-${randomUUID()}`;
  const baseName = trimmed || fallback;

  return baseName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || fallback;
}
