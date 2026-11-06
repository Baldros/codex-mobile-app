import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AppServerBridgeService } from "../src/appServer/AppServerBridgeService.js";
import type { AppServerClient } from "../src/appServer/AppServerClient.js";
import type { BridgeConfig } from "../src/config.js";
import { WorkspaceService } from "../src/workspaces/WorkspaceService.js";
import { UploadService } from "../src/uploads/UploadService.js";

describe("AppServerBridgeService thread actions", () => {
  it("renames and archives threads through app-server RPC methods", async () => {
    const client = new CapturingAppServerClient();
    const service = new AppServerBridgeService({
      config: testConfig(),
      client: client as unknown as AppServerClient,
      workspaceService: new WorkspaceService(testConfig())
    });

    const renamed = (await service.renameThread("thr_1", { title: "Mobile title" })) as {
      title: string;
    };
    await service.archiveThread("thr_1", { archived: true });
    await service.archiveThread("thr_1", { archived: false });

    expect(renamed.title).toBe("Mobile title");
    expect(client.requests.map((request) => request.method)).toEqual([
      "thread/name/set",
      "thread/read",
      "thread/archive",
      "thread/unarchive"
    ]);
    expect(client.requests[0]?.params).toEqual({
      threadId: "thr_1",
      name: "Mobile title"
    });
  });

  it("lists, reloads, and reads MCP resources through app-server RPC methods", async () => {
    const client = new CapturingAppServerClient();
    const service = new AppServerBridgeService({
      config: testConfig(),
      client: client as unknown as AppServerClient,
      workspaceService: new WorkspaceService(testConfig())
    });

    await service.listMcpServers({ detail: "full", limit: 10, cursor: "cursor_1" });
    await service.readMcpResource({ server: "github", uri: "repo://openai/codex", threadId: "thr_1" });
    await service.reloadMcpServers();

    expect(client.requests.slice(-3)).toEqual([
      {
        method: "mcpServerStatus/list",
        params: { detail: "full", limit: 10, cursor: "cursor_1" }
      },
      {
        method: "mcpServer/resource/read",
        params: { server: "github", uri: "repo://openai/codex", threadId: "thr_1" }
      },
      {
        method: "config/mcpServer/reload",
        params: undefined
      }
    ]);
  });

  it("lists apps and skills through app-server RPC methods", async () => {
    const client = new CapturingAppServerClient();
    const service = new AppServerBridgeService({
      config: testConfig(),
      client: client as unknown as AppServerClient,
      workspaceService: new WorkspaceService(testConfig())
    });

    await service.listApps({ limit: 20, cursor: "apps_cursor", threadId: "thr_1", forceRefetch: true });
    await service.listSkills({ cwd: process.cwd(), forceReload: true });

    expect(client.requests.slice(-2)).toEqual([
      {
        method: "app/list",
        params: { limit: 20, cursor: "apps_cursor", threadId: "thr_1", forceRefetch: true }
      },
      {
        method: "skills/list",
        params: { cwds: [process.cwd()], forceReload: true }
      }
    ]);
  });

  it("pins attachments and passes images and controlled file references to app-server", async () => {
    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-turn-upload-"));
    const uploads = new UploadService({ uploadDir, maxBytes: 1024, totalMaxBytes: 4096 });
    try {
      const png = Buffer.alloc(24);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
      png.write("IHDR", 12, "ascii");
      const image = uploads.save({ name: "diagram.png", dataBase64: png.toString("base64") });
      const file = uploads.save({ name: "notes.txt", dataBase64: Buffer.from("notes").toString("base64") });
      const client = new CapturingAppServerClient();
      const service = new AppServerBridgeService({ config: testConfig(),
        client: client as unknown as AppServerClient,
        workspaceService: new WorkspaceService(testConfig()), uploadService: uploads });
      const iterator = service.runThread("thr_1", { message: "review", cwd: process.cwd(), input_items: [
        { type: "attachment", id: image.id, name: "client name is ignored" },
        { type: "attachment", id: file.id, name: "client name is ignored" }
      ] }, new AbortController().signal);
      expect((await iterator.next()).value).toMatchObject({ event: "run_started" });
      const input = (client.requests.find((request) => request.method === "turn/start")?.params as { input: Array<Record<string, unknown>> }).input;
      expect(input[1]).toEqual({ type: "localImage", path: uploads.resolve(image.id).path });
      expect(input[2]).toMatchObject({ type: "text" });
      expect(input[2]?.text).toContain(JSON.stringify(uploads.resolve(file.id).path));
      expect(input[2]?.text).toContain("notes.txt");
      expect(input[2]?.text).not.toContain("client name is ignored");
      expect(() => uploads.remove(file.id)).toThrowError(expect.objectContaining({ code: "attachment_in_use" }));
      await iterator.return(undefined);
      uploads.remove(file.id);
      uploads.remove(image.id);
    } finally {
      uploads.dispose();
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  });
});

class CapturingAppServerClient {
  readonly requests: Array<{ method: string; params: unknown }> = [];

  async request(method: string, params?: unknown) {
    this.requests.push({ method, params });
    if (method === "thread/read" || method === "thread/unarchive") {
      return {
        thread: {
          id: "thr_1",
          sessionId: "thr_1",
          preview: "",
          name: "Mobile title",
          cwd: process.cwd(),
          createdAt: 1,
          updatedAt: 1,
          status: { type: "idle" },
          path: null,
          modelProvider: "openai",
          source: "appServer",
          turns: []
        }
      };
    }
    if (method === "mcpServerStatus/list") {
      return { data: [], nextCursor: null };
    }
    if (method === "mcpServer/resource/read") {
      return { contents: [{ uri: "repo://openai/codex", text: "resource body" }] };
    }
    if (method === "app/list") {
      return { data: [], nextCursor: null };
    }
    if (method === "skills/list") {
      return { data: [] };
    }
    if (method === "turn/start") return { turn: { id: "turn_1" } };
    return {};
  }

  onNotification() { return () => undefined; }
  onServerRequest() { return () => undefined; }
}

function testConfig(): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 8787,
    runtime: "app-server",
    workspaceAllowlist: [process.cwd()],
    workspaceAllowlistFile: "__missing_allowlist__",
    defaultWorkspace: process.cwd(),
    defaultSkipGitRepoCheck: true,
    defaultModel: null,
    heartbeatMs: 15000,
    runBufferEvents: 5000,
    runRetentionMs: 300000,
    uploadDir: "__test_uploads__",
    uploadMaxBytes: 15 * 1024 * 1024,
    uploadTotalMaxBytes: 512 * 1024 * 1024,
    uploadsEnabled: false,
    version: "test"
  };
}
