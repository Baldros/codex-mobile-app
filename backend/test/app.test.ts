import { createServer, type Server } from "node:http";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { BridgeConfig } from "../src/config.js";
import { MockCodexRuntime } from "../src/runtime/MockCodexRuntime.js";
import type { RuntimeThreadOptions } from "../src/runtime/types.js";
import { InMemoryThreadStore } from "../src/threads/InMemoryThreadStore.js";
import { ThreadService } from "../src/threads/ThreadService.js";

describe("Codex bridge HTTP API", () => {
  let server: Server;
  let baseUrl: string;
  let runtime: CapturingMockCodexRuntime;

  beforeEach(async () => {
    const config = testConfig();
    runtime = new CapturingMockCodexRuntime();
    const threadService = new ThreadService({
      config,
      runtime,
      store: new InMemoryThreadStore()
    });
    server = createServer(createApp({ config, threadService }));
    baseUrl = await listen(server);
  });

  afterEach(async () => {
    await close(server);
  });

  it("returns health for the configured runtime", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      codex_ready: true,
      auth: "ok",
      active_transport: "mock"
    });
  });

  it("allows browser clients to call the bridge API", async () => {
    const preflight = await fetch(`${baseUrl}/v1/workspaces`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:8081",
        "Access-Control-Request-Method": "GET"
      }
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-methods")).toContain("GET");

    const response = await fetch(`${baseUrl}/v1/workspaces`, {
      headers: {
        Origin: "http://localhost:8081"
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("creates and lists threads", async () => {
    const created = await createThread(baseUrl, {
      title: "Bridge test",
      workspace: process.cwd()
    });

    expect(created.thread.title).toBe("Bridge test");

    const response = await fetch(`${baseUrl}/v1/threads`);
    const body = (await response.json()) as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(created.thread.id);
  });

  it("renames threads through the bridge API", async () => {
    const created = await createThread(baseUrl, {
      title: "Original",
      workspace: process.cwd()
    });

    const response = await fetch(`${baseUrl}/v1/threads/${created.thread.id}/name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed from mobile" })
    });
    const body = (await response.json()) as { thread: { title: string } };

    expect(response.status).toBe(200);
    expect(body.thread.title).toBe("Renamed from mobile");
  });

  it("reports archive support through capabilities and unsupported archive responses", async () => {
    const created = await createThread(baseUrl, { workspace: process.cwd() });

    const capabilitiesResponse = await fetch(`${baseUrl}/v1/capabilities`);
    const capabilities = (await capabilitiesResponse.json()) as {
      threads: { rename: boolean; archive: boolean };
      workspaces: { remove: boolean; restore: boolean };
    };

    expect(capabilitiesResponse.status).toBe(200);
    expect(capabilities.threads).toEqual({ rename: true, archive: false });
    expect(capabilities.workspaces).toEqual({ remove: false, restore: false });

    const archiveResponse = await fetch(`${baseUrl}/v1/threads/${created.thread.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true })
    });
    const archive = (await archiveResponse.json()) as { supported: boolean; archived: boolean };

    expect(archiveResponse.status).toBe(200);
    expect(archive).toMatchObject({ supported: false, archived: false });
  });

  it("streams a Codex run as SSE", async () => {
    const created = await createThread(baseUrl, { workspace: process.cwd() });

    const response = await fetch(`${baseUrl}/v1/threads/${created.thread.id}/runs/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "diagnose the bridge" })
    });
    const text = await response.text();
    const events = parseSse(text);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.event)).toEqual([
      "run_started",
      "thread_started",
      "agent_message",
      "done"
    ]);
    expect(events.at(-1)?.data).toMatchObject({ status: "completed" });
  });

  it("passes execution settings to the runtime", async () => {
    const created = await createThread(baseUrl, { workspace: process.cwd() });

    const response = await fetch(`${baseUrl}/v1/threads/${created.thread.id}/runs/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "use explicit execution settings",
        approval_policy: "never",
        sandbox_mode: "danger-full-access",
        model_reasoning_effort: "high",
        network_access_enabled: true
      })
    });

    expect(response.status).toBe(200);
    await response.text();
    expect(runtime.lastOptions).toMatchObject({
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      modelReasoningEffort: "high",
      networkAccessEnabled: true
    });
  });

  it("rejects workspaces outside the allowlist", async () => {
    const response = await fetch(`${baseUrl}/v1/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: "C:\\Windows" })
    });
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("workspace_not_allowed");
  });

  it("lists configured workspaces", async () => {
    const response = await fetch(`${baseUrl}/v1/workspaces`);
    const body = (await response.json()) as { data: Array<{ path: string; exists: boolean }> };

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      path: process.cwd(),
      exists: true
    });
  });
});

describe("Codex bridge cancellation", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const config = testConfig({ heartbeatMs: 50 });
    const threadService = new ThreadService({
      config,
      runtime: new MockCodexRuntime({ delayMs: 250 }),
      store: new InMemoryThreadStore()
    });
    server = createServer(createApp({ config, threadService }));
    baseUrl = await listen(server);
  });

  afterEach(async () => {
    await close(server);
  });

  it("cancels an active run by id", async () => {
    const created = await createThread(baseUrl, { workspace: process.cwd() });
    const streamResponse = await fetch(`${baseUrl}/v1/threads/${created.thread.id}/runs/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "slow run" })
    });

    expect(streamResponse.body).not.toBeNull();
    const reader = streamResponse.body!.getReader();
    const firstChunk = await readUntil(reader, "event: run_started");
    const runStarted = parseSse(firstChunk).find((event) => event.event === "run_started");
    expect(runStarted).toBeDefined();

    const cancelResponse = await fetch(`${baseUrl}/v1/threads/${created.thread.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runStarted!.data.run_id })
    });
    const cancelBody = (await cancelResponse.json()) as { cancelled: boolean };
    expect(cancelResponse.status).toBe(200);
    expect(cancelBody.cancelled).toBe(true);

    const rest = await readRest(reader);
    const events = parseSse(`${firstChunk}${rest}`);
    expect(events.at(-1)).toMatchObject({
      event: "done",
      data: { status: "cancelled" }
    });
  });
});

class CapturingMockCodexRuntime extends MockCodexRuntime {
  lastOptions: RuntimeThreadOptions | null = null;

  override startThread(options: RuntimeThreadOptions) {
    this.lastOptions = options;
    return super.startThread(options);
  }

  override resumeThread(id: string, options: RuntimeThreadOptions) {
    this.lastOptions = options;
    return super.resumeThread(id, options);
  }
}

function testConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  const config: BridgeConfig = {
    host: "127.0.0.1",
    port: 8787,
    runtime: "mock",
    workspaceAllowlist: [process.cwd()],
    workspaceAllowlistFile: "__missing_allowlist__",
    defaultWorkspace: process.cwd(),
    defaultSkipGitRepoCheck: true,
    defaultModel: null,
    heartbeatMs: 15000,
    version: "test"
  };
  return Object.assign(config, overrides);
}

async function listen(server: Server) {
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP server address.");
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function createThread(baseUrl: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/v1/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  expect(response.status).toBe(201);
  return (await response.json()) as { thread: { id: string; title: string } };
}

function parseSse(text: string) {
  return text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (!event || !data) {
        throw new Error(`Invalid SSE block: ${block}`);
      }
      return { event, data: JSON.parse(data) };
    });
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string) {
  const decoder = new TextDecoder();
  let text = "";

  while (!text.includes(marker)) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }

  return text;
}

async function readRest(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    text += decoder.decode(value, { stream: true });
  }

  return text;
}
