import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import {
  createUploadSlot,
  type CreateReportMediaInput
} from "./reportsApi";
import { supabase } from "./supabase";

export type PendingReportMedia = {
  uri: string;
  fileName: string;
  mediaType: "image" | "video";
  mimeType: string;
  sizeBytes?: number;
  widthPx?: number;
  heightPx?: number;
  durationSeconds?: number;
};

export function toPendingReportMedia(
  asset: ImagePicker.ImagePickerAsset
): PendingReportMedia {
  const mediaType =
    asset.type === "video" ? "video" : "image";
  const mimeType =
    asset.mimeType ??
    (mediaType === "video" ? "video/mp4" : "image/jpeg");
  const extension = guessExtension(mimeType, mediaType);
  const fileName =
    asset.fileName ??
    `${mediaType}-${Date.now().toString()}.${extension}`;

  return {
    uri: asset.uri,
    fileName,
    mediaType,
    mimeType,
    sizeBytes: asset.fileSize ?? undefined,
    widthPx: asset.width ?? undefined,
    heightPx: asset.height ?? undefined,
    durationSeconds:
      typeof asset.duration === "number"
        ? Math.max(1, Math.round(asset.duration / 1000))
        : undefined
  };
}

export async function uploadReportMedia(
  media: PendingReportMedia
): Promise<CreateReportMediaInput> {
  let fileBytes: Uint8Array<ArrayBuffer>;
  try {
    fileBytes = await new File(media.uri).bytes();
  } catch {
    throw new Error("Failed to read the selected media file.");
  }

  const sizeBytes = media.sizeBytes ?? fileBytes.byteLength;
  if (sizeBytes <= 0) {
    throw new Error("The selected media file is empty.");
  }

  const uploadSlot = await createUploadSlot({
    fileName: media.fileName,
    contentType: media.mimeType,
    mediaType: media.mediaType,
    sizeBytes
  });

  const uploadResult = await supabase.storage
    .from(uploadSlot.bucket)
    .uploadToSignedUrl(
      uploadSlot.storageKey,
      uploadSlot.uploadToken,
      fileBytes,
      {
        contentType: media.mimeType,
        upsert: false
      }
    );

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  return {
    storageKey: uploadSlot.storageKey,
    mediaType: media.mediaType,
    mimeType: media.mimeType,
    sizeBytes,
    widthPx: media.widthPx,
    heightPx: media.heightPx,
    durationSeconds: media.durationSeconds
  };
}

function guessExtension(
  mimeType: string,
  mediaType: "image" | "video"
) {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("png")) {
    return "png";
  }
  if (normalized.includes("webp")) {
    return "webp";
  }
  if (normalized.includes("heic")) {
    return "heic";
  }
  if (normalized.includes("mov")) {
    return "mov";
  }
  if (normalized.includes("webm")) {
    return "webm";
  }
  if (normalized.includes("mp4")) {
    return "mp4";
  }

  return mediaType === "video" ? "mp4" : "jpg";
}
