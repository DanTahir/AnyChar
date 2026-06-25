import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { config } from "./config";

const s3 = new S3Client({ region: config.awsRegion });

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function validateImage(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 2MB or smaller.";
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Image must be JPEG, PNG, WebP, or GIF.";
  }
  return null;
}

export function extForType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "jpg";
  }
}

export async function uploadImage(key: string, body: Buffer, contentType: string) {
  if (!config.s3Bucket) throw new Error("S3_BUCKET is not set");
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteImage(key: string) {
  if (!config.s3Bucket || !key) return;
  await s3.send(
    new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: key }),
  );
}

export async function fetchImage(key: string) {
  if (!config.s3Bucket || !key) return null;
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: config.s3Bucket, Key: key }),
  );
  if (!resp.Body) return null;
  const bytes = await resp.Body.transformToByteArray();
  return {
    body: Buffer.from(bytes),
    contentType: (resp.ContentType as string | undefined) ?? "image/jpeg",
  };
}

export function characterImageKey(ownerId: string, slug: string, ext: string) {
  return `characters/${ownerId}/${slug}/avatar.${ext}`;
}

export function knownUserImageKey(
  ownerId: string,
  slug: string,
  knownUserId: string,
  ext: string,
) {
  return `characters/${ownerId}/${slug}/known/${knownUserId}.${ext}`;
}
