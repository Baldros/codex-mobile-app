import { describe, expect, it } from "vitest";

import { AppServerBridgeService } from "../src/appServer/AppServerBridgeService.js";
import type {
  AppServerClient,
  AppServerNotification,
  AppServerRequest
} from "../src/appServer/AppServerClient.js";
import type { BridgeConfig } from "../src/config.js";
import { saveUploadedImage } from "../src/uploads/imageUploads.js";
import { WorkspaceService } from "../src/workspaces/WorkspaceService.js";

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

  it("passes xhigh reasoning effort to app-server turn start", async () => {
    const client = new CapturingAppServerClient();
    const service = new AppServerBridgeService({
      config: testConfig(),
      client: client as unknown as AppServerClient,
      workspaceService: new WorkspaceService(testConfig())
    });

    const events = service.runThread(
      "thr_1",
      {
        message: "use maximum effort",
        cwd: process.cwd(),
        model_reasoning_effort: "xhigh"
      },
      new AbortController().signal
    );

    const firstEvent = await events.next();
    await events.return(undefined);

    expect(firstEvent.value).toEqual({
      event: "run_started",
      data: {
        thread_id: "thr_1",
        run_id: "turn_1"
      }
    });

    const turnStart = client.requests.find((request) => request.method === "turn/start");
    expect(turnStart?.params).toMatchObject({
      threadId: "thr_1",
      effort: "xhigh"
    });
    expect(turnStart?.params).not.toHaveProperty("modelReasoningEffort");
    expect(turnStart?.params).not.toHaveProperty("model_reasoning_effort");
  });

  it("passes uploaded image attachments to app-server as local images", async () => {
    const client = new CapturingAppServerClient();
    const service = new AppServerBridgeService({
      config: testConfig(),
      client: client as unknown as AppServerClient,
      workspaceService: new WorkspaceService(testConfig())
    });
    const image = await saveUploadedImage({
      filename: "screen.png",
      mime_type: "image/png",
      data_base64: Buffer.from("fake png").toString("base64")
    });

    const events = service.runThread(
      "thr_1",
      {
        message: "describe this screenshot",
        cwd: process.cwd(),
        input_items: [
          {
            type: "image",
            path: image.path,
            name: image.filename,
            mime_type: image.mime_type
          }
        ]
      },
      new AbortController().signal
    );

    await events.next();
    await events.return(undefined);

    const turnStart = client.requests.find((request) => request.method === "turn/start");
    expect(turnStart?.params).toMatchObject({
      input: [
        { type: "text", text: "describe this screenshot" },
        { type: "localImage", path: image.path }
      ]
    });
  });

  it("starts thread compaction and waits for the compacted notification", async () => {
    const client = new CapturingAppServerClient();
    const service = new AppServerBridgeService({
      config: testConfig(),
      client: client as unknown as AppServerClient,
      workspaceService: new WorkspaceService(testConfig())
    });

    const compact = service.compactThread("thr_1");
    await Promise.resolve();
    client.emitNotification({
      method: "thread/compacted",
      params: {
        threadId: "thr_1",
        turnId: "turn_1"
      }
    });

    await expect(compact).resolves.toEqual({
      supported: true,
      compacted: true,
      thread_id: "thr_1"
    });
    expect(client.requests.at(-1)).toEqual({
      method: "thread/compact/start",
      params: { threadId: "thr_1" }
    });
  });
});

class CapturingAppServerClient {
  readonly requests: Array<{ method: string; params: unknown }> = [];
  private readonly notificationListeners = new Set<(message: AppServerNotification) => void>();
  private readonly serverRequestListeners = new Set<(message: AppServerRequest) => void>();

  async request(method: string, params?: unknown) {
    this.requests.push({ method, params });
    if (method === "thread/resume") {
      return { thread: { id: "thr_1" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_1" } };
    }
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
    return {};
  }

  onNotification(listener: (message: AppServerNotification) => void) {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onServerRequest(listener: (message: AppServerRequest) => void) {
    this.serverRequestListeners.add(listener);
    return () => this.serverRequestListeners.delete(listener);
  }

  emitNotification(message: AppServerNotification) {
    for (const listener of this.notificationListeners) {
      listener(message);
    }
  }
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
    version: "test"
  };
}
