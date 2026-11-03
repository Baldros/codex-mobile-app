import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UploadService } from "../src/uploads/UploadService.js";

let root: string;
let service: UploadService;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-upload-test-"));
  service = new UploadService({ uploadDir: root, maxBytes: 16, totalMaxBytes: 24, ttlMs: 1000 });
});
afterEach(() => {
  service.dispose();
  fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("UploadService", () => {
  it("issues opaque IDs and restores metadata without exposing host paths", () => {
    const attachment = service.save({ name: "../notes.txt", dataBase64: Buffer.from("hello").toString("base64") });
    expect(attachment.name).toBe("notes.txt");
    expect(attachment).not.toHaveProperty("path");
    expect(fs.readFileSync(service.resolve(attachment.id).path, "utf8")).toBe("hello");
    service.dispose();
    service = new UploadService({ uploadDir: root, maxBytes: 16, totalMaxBytes: 24, ttlMs: 1000 });
    expect(service.resolve(attachment.id).name).toBe("notes.txt");
    expect(() => service.resolve("../../secret")).toThrow();
  });

  it("rejects malformed, oversized, and mislabeled image data", () => {
    expect(() => service.save({ dataBase64: "YQ==junk" })).toThrow();
    expect(() => service.save({ dataBase64: Buffer.alloc(17).toString("base64") })).toThrow();
    expect(() => service.save({ name: "fake.png", dataBase64: Buffer.from("hello").toString("base64") })).toThrow();
  });

  it("enforces storage quota and protects pinned files until release", () => {
    const first = service.save({ name: "one.txt", dataBase64: Buffer.alloc(14).toString("base64") });
    expect(() => service.save({ name: "two.txt", dataBase64: Buffer.alloc(14).toString("base64") })).toThrow();
    const release = service.pin([first.id]);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2000);
    service.cleanup();
    expect(service.resolve(first.id).size).toBe(14);
    release();
    vi.setSystemTime(Date.now() + 2000);
    service.cleanup();
    expect(() => service.resolve(first.id)).toThrow();
  });

  it("rejects a symlink substituted for an uploaded file", () => {
    const attachment = service.save({ name: "safe.txt", dataBase64: Buffer.from("safe").toString("base64") });
    const stored = service.resolve(attachment.id).path;
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "codex-upload-outside-"));
    try {
      const target = path.join(outside, "private.txt");
      fs.writeFileSync(target, "secret");
      fs.unlinkSync(stored);
      try {
        fs.symlinkSync(target, stored, "file");
      } catch (error) {
        if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
        throw error;
      }
      expect(() => service.resolve(attachment.id)).toThrowError(expect.objectContaining({ code: "invalid_attachment" }));
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("removes orphaned files left by interrupted writes", () => {
    const orphan = path.join(root, "upload_12345678-1234-1234-1234-123456789abc.bin");
    fs.writeFileSync(orphan, "orphan");
    service.cleanup();
    expect(fs.existsSync(orphan)).toBe(false);
  });
});
