import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { AppError } from "../errors.js";

type Kind = "image" | "file";
type Metadata = {
  id: string;
  name: string;
  size: number;
  kind: Kind;
  extension: string;
  created_at: string;
  expires_at: number;
  in_use: boolean;
};

const ID_PATTERN = /^upload_[0-9a-f]{8}-[0-9a-f-]{27,}$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".heic", ".heif", ".tif", ".tiff"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/heic", "image/heif", "image/tiff"]);
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export class UploadService {
  private readonly entries = new Map<string, Metadata>();
  private readonly pins = new Map<string, number>();
  private readonly root: string;
  private readonly timer: NodeJS.Timeout;
  private activeUploads = 0;

  constructor(private readonly options: { uploadDir: string; maxBytes: number; totalMaxBytes: number; ttlMs?: number }) {
    this.root = path.resolve(options.uploadDir);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (fs.lstatSync(this.root).isSymbolicLink() || !fs.statSync(this.root).isDirectory()) {
      throw new AppError(500, "unsafe_upload_dir", "Upload directory must be a real directory.");
    }
    this.loadMetadata();
    this.cleanup();
    this.timer = setInterval(() => this.cleanup(), 60 * 60 * 1000);
    this.timer.unref();
  }

  get maxBytes() { return this.options.maxBytes; }
  get totalMaxBytes() { return this.options.totalMaxBytes; }

  acquireUpload() {
    if (this.activeUploads >= 2) throw new AppError(429, "too_many_uploads", "Too many uploads in progress.");
    this.activeUploads += 1;
    return () => { this.activeUploads -= 1; };
  }

  save(input: { name?: string | null; mimeType?: string | null; dataBase64: string }) {
    const bytes = decodeBase64(input.dataBase64, this.maxBytes);
    this.cleanup();
    if (this.entries.size >= 2000) {
      throw new AppError(507, "upload_storage_full", "Upload file-count limit is full.");
    }
    const occupied = [...this.entries.values()].reduce((sum, item) => sum + item.size, 0);
    if (occupied + bytes.length > this.totalMaxBytes) {
      throw new AppError(507, "upload_storage_full", "Upload storage quota is full.");
    }

    const name = sanitizeName(input.name);
    const extension = path.extname(name).toLowerCase();
    const mime = input.mimeType?.toLowerCase() ?? "";
    const detected = detectImage(bytes);
    if ((IMAGE_EXTENSIONS.has(extension) || IMAGE_MIMES.has(mime)) && !detected) {
      throw new AppError(415, "unsupported_image", "Image data is invalid or unsupported.");
    }
    const id = `upload_${randomUUID()}`;
    const metadata: Metadata = {
      id,
      name,
      size: bytes.length,
      kind: detected ? "image" : "file",
      extension: detected ?? ".bin",
      created_at: new Date().toISOString(),
      expires_at: Date.now() + (this.options.ttlMs ?? DEFAULT_TTL_MS),
      in_use: false
    };
    const filePath = this.filePath(metadata);
    try {
      fs.writeFileSync(filePath, bytes, { flag: "wx", mode: 0o600 });
      this.writeMetadata(metadata);
      this.entries.set(id, metadata);
    } catch (error) {
      try { fs.unlinkSync(filePath); } catch { /* file was not created */ }
      throw error;
    }
    return publicAttachment(metadata);
  }

  resolve(id: string) {
    const metadata = this.requireEntry(id);
    const candidate = this.filePath(metadata);
    const stats = fs.lstatSync(candidate, { throwIfNoEntry: false });
    if (!stats?.isFile() || stats.isSymbolicLink() || stats.size !== metadata.size) {
      throw new AppError(400, "invalid_attachment", "Attachment file is missing or changed.");
    }
    const realRoot = fs.realpathSync.native(this.root);
    const realFile = fs.realpathSync.native(candidate);
    if (path.dirname(realFile) !== realRoot) {
      throw new AppError(400, "invalid_attachment", "Attachment path escaped the upload directory.");
    }
    return { path: realFile, kind: metadata.kind, name: metadata.name, size: metadata.size };
  }

  pin(ids: string[]) {
    for (const id of ids) this.resolve(id);
    for (const id of ids) {
      const metadata = this.entries.get(id)!;
      this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
      metadata.in_use = true;
      this.writeMetadata(metadata);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const id of ids) {
        const count = (this.pins.get(id) ?? 1) - 1;
        if (count > 0) { this.pins.set(id, count); continue; }
        this.pins.delete(id);
        const metadata = this.entries.get(id);
        if (!metadata) continue;
        metadata.in_use = false;
        metadata.expires_at = Date.now() + (this.options.ttlMs ?? DEFAULT_TTL_MS);
        this.writeMetadata(metadata);
      }
    };
  }

  remove(id: string) {
    const metadata = this.requireEntry(id);
    if (metadata.in_use || this.pins.has(id)) {
      throw new AppError(409, "attachment_in_use", "Attachment is used by a run.");
    }
    this.removeEntry(metadata);
  }

  cleanup() {
    const now = Date.now();
    for (const metadata of [...this.entries.values()]) {
      if (!metadata.in_use && !this.pins.has(metadata.id) && metadata.expires_at <= now) {
        this.removeEntry(metadata);
      }
    }
    this.removeOrphans();
  }

  dispose() { clearInterval(this.timer); }

  private requireEntry(id: string) {
    if (!ID_PATTERN.test(id)) throw new AppError(400, "invalid_attachment", "Invalid attachment ID.");
    const metadata = this.entries.get(id);
    if (!metadata || (!metadata.in_use && !this.pins.has(id) && metadata.expires_at <= Date.now())) {
      throw new AppError(404, "attachment_not_found", "Attachment is missing or expired.");
    }
    return metadata;
  }

  private filePath(metadata: Metadata) { return path.join(this.root, `${metadata.id}${metadata.extension}`); }
  private metadataPath(id: string) { return path.join(this.root, `${id}.json`); }

  private writeMetadata(metadata: Metadata) {
    const target = this.metadataPath(metadata.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, target);
  }

  private removeEntry(metadata: Metadata) {
    // Delete only names generated from validated server IDs, never client paths.
    try { fs.unlinkSync(this.filePath(metadata)); } catch (error) {
      if (!isMissing(error)) throw error;
    }
    try { fs.unlinkSync(this.metadataPath(metadata.id)); } catch (error) {
      if (!isMissing(error)) throw error;
    }
    this.entries.delete(metadata.id);
  }

  private loadMetadata() {
    for (const filename of fs.readdirSync(this.root)) {
      if (!filename.endsWith(".json")) continue;
      const id = filename.slice(0, -5);
      if (!ID_PATTERN.test(id)) continue;
      try {
        if (!fs.lstatSync(this.metadataPath(id)).isFile()) continue;
        const candidate = JSON.parse(fs.readFileSync(this.metadataPath(id), "utf8")) as Metadata;
        if (candidate.id !== id || ![".png", ".jpg", ".webp", ".bin"].includes(candidate.extension) ||
            !Number.isSafeInteger(candidate.size) || candidate.size <= 0 || candidate.size > this.maxBytes ||
            !Number.isSafeInteger(candidate.expires_at) ||
            typeof candidate.name !== "string" || candidate.name.length > 120 ||
            (candidate.kind !== "image" && candidate.kind !== "file")) continue;
        // The previous Bridge owned any in-flight run. Give its files a full
        // grace period after restart instead of deleting them on startup.
        if (candidate.in_use) {
          candidate.in_use = false;
          candidate.expires_at = Date.now() + (this.options.ttlMs ?? DEFAULT_TTL_MS);
          this.writeMetadata(candidate);
        }
        this.entries.set(id, candidate);
      } catch { /* Ignore malformed metadata; never derive a host path from it. */ }
    }
  }

  private removeOrphans() {
    const filePattern = /^(upload_[0-9a-f]{8}-[0-9a-f-]{27,})\.(png|jpg|webp|bin|json)$/;
    const temporaryPattern = /^upload_[0-9a-f]{8}-[0-9a-f-]{27,}\.json\.[0-9a-f-]+\.tmp$/;
    for (const filename of fs.readdirSync(this.root)) {
      const match = filename.match(filePattern);
      if (!match && !temporaryPattern.test(filename)) continue;
      if (match && this.entries.has(match[1]!)) continue;
      const candidate = path.join(this.root, filename);
      try {
        if (!fs.lstatSync(candidate).isDirectory()) fs.unlinkSync(candidate);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  }
}

function publicAttachment(item: Metadata) {
  return { id: item.id, name: item.name, size: item.size, kind: item.kind, created_at: item.created_at };
}

function decodeBase64(value: string, maxBytes: number) {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new AppError(400, "invalid_base64", "Attachment payload must be canonical Base64.");
  }
  const expected = value.length / 4 * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  if (expected > maxBytes) throw new AppError(413, "attachment_too_large", "Attachment exceeds the size limit.");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== value) {
    throw new AppError(400, "invalid_base64", "Attachment payload is invalid or empty.");
  }
  return bytes;
}

function detectImage(bytes: Buffer): ".png" | ".jpg" | ".webp" | null {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString("ascii", 12, 16) === "IHDR") return ".png";
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return ".jpg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return null;
}

function sanitizeName(value: string | null | undefined) {
  const basename = path.posix.basename((value ?? "attachment").replace(/\\/g, "/"));
  return basename.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\w.() -]/g, "_").replace(/^[. ]+/, "").slice(0, 120) || "attachment";
}

function isMissing(error: unknown) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
