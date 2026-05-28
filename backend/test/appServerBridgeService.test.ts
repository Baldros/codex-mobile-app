import { describe, expect, it } from "vitest";

import { AppServerBridgeService } from "../src/appServer/AppServerBridgeService.js";
import type { AppServerClient } from "../src/appServer/AppServerClient.js";
import type { BridgeConfig } from "../src/config.js";
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
    return {};
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
