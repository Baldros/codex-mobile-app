import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AppError } from "../errors.js";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_UPLOAD_JSON_LIMIT_BYTES = 14 * 1024 * 1024;

const UPLOAD_DIR_NAME = "codex-mobile-bridge-images";

const SUPPORTED_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"]
]);

export type SaveUploadedImageInput = {
  filename?: string | undefined;
  mime_type: string;
  data_base64: string;
};

export type UploadedImage = {
  id: string;
  filename: string;
  path: string;
  mime_type: string;
  size_bytes: number;
};

export async function saveUploadedImage(input: SaveUploadedImageInput): Promise<UploadedImage> {
  const mimeType = input.mime_type.trim().toLowerCase();
  const extension = SUPPORTED_IMAGE_TYPES.get(mimeType);
  if (!extension) {
    throw new AppError(400, "unsupported_image_type", "Only PNG, JPEG, and WebP images are supported.");
  }

  if (!isBase64(input.data_base64)) {
    throw new AppError(400, "invalid_image_data", "Image data must be base64 encoded.");
  }

  const buffer = Buffer.from(input.data_base64, "base64");
  if (buffer.byteLength === 0) {
    throw new AppError(400, "invalid_image_data", "Image data is empty.");
  }
  if (buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
    throw new AppError(413, "image_too_large", "Image is larger than 10 MiB.");
  }

  const id = `img_${randomUUID()}`;
  const filename = `${id}.${extension}`;
  const uploadDir = imageUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, filename);
  await fs.writeFile(filePath, buffer, { flag: "wx" });

  return {
    id,
    filename: sanitizeDisplayName(input.filename) ?? filename,
    path: filePath,
    mime_type: mimeType,
    size_bytes: buffer.byteLength
  };
}

export function assertUploadedImagePath(candidate: string) {
  const resolved = path.resolve(candidate);
  const root = path.resolve(imageUploadDir());
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError(400, "invalid_image_path", "Image attachments must be uploaded through the bridge.");
  }
  return resolved;
}

function imageUploadDir() {
  return path.join(os.tmpdir(), UPLOAD_DIR_NAME);
}

function isBase64(value: string) {
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function sanitizeDisplayName(value: string | undefined) {
  if (!value) {
    return null;
  }

  const sanitized = value.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_").trim();
  return sanitized.length > 0 ? sanitized.slice(0, 120) : null;
}
