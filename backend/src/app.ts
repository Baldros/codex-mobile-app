import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { AppServerBridgeService } from "./appServer/AppServerBridgeService.js";
import { AppServerClient } from "./appServer/AppServerClient.js";
import type { BridgeThreadQuery, BridgeThreadService } from "./appServer/types.js";
import { getBridgeConfig, type BridgeConfig } from "./config.js";
import { AppError, getErrorPayload } from "./errors.js";
import { createRuntime } from "./runtime/createRuntime.js";
import type { CodexRuntimeHealth } from "./runtime/types.js";
import { RunRegistry } from "./runs/RunRegistry.js";
import { SseWriter } from "./sse.js";
import { InMemoryThreadStore } from "./threads/InMemoryThreadStore.js";
import { ThreadService } from "./threads/ThreadService.js";
import { WorkspaceService } from "./workspaces/WorkspaceService.js";
import {
  ArchiveThreadBodySchema,
  ApprovalResponseBodySchema,
  CancelRunBodySchema,
  CreateThreadBodySchema,
  McpResourceReadBodySchema,
  RenameThreadBodySchema,
  RunStreamBodySchema,
  WorkspacePathBodySchema,
  WriteConfigBodySchema
} from "./validation.js";

export type AppDependencies = {
  config?: BridgeConfig;
  threadService?: BridgeThreadService;
  runRegistry?: RunRegistry;
  workspaceService?: WorkspaceService;
  appServerClient?: AppServerClient;
};

export function createApp(deps: AppDependencies = {}) {
  const config = deps.config ?? getBridgeConfig();
  const workspaceService = deps.workspaceService ?? new WorkspaceService(config);
  const threadService =
    deps.threadService ??
    createDefaultThreadService(config, workspaceService, deps.appServerClient);
  const runRegistry = deps.runRegistry ?? new RunRegistry(threadService);

  return async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    applyCorsHeaders(res);

    try {
      await routeRequest(req, res, config, threadService, runRegistry, workspaceService);
    } catch (error) {
      sendError(res, error);
    }
  };
}

export function createBridgeServer(deps: AppDependencies = {}) {
  return createServer(createApp(deps));
}

async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: BridgeConfig,
  threadService: BridgeThreadService,
  runRegistry: RunRegistry,
  workspaceService: WorkspaceService
) {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = trimTrailingSlash(url.pathname);

  if (method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (method === "GET" && pathname === "/health") {
    const started = performance.now();
    const runtimeHealth = await threadService.health();
    sendJson(res, 200, buildHealthResponse(config, runtimeHealth, performance.now() - started));
    return;
  }

  if (method === "GET" && pathname === "/v1/capabilities") {
    sendJson(res, 200, buildCapabilitiesResponse(threadService, workspaceService));
    return;
  }

  if (method === "GET" && pathname === "/v1/threads") {
    sendJson(res, 200, await normalizeListThreadsResponse(threadService.listThreads(parseThreadQuery(url))));
    return;
  }

  if (method === "POST" && pathname === "/v1/threads") {
    const body = CreateThreadBodySchema.parse(await readJson(req));
    const thread = await threadService.createThread(body);
    sendJson(res, 201, { thread });
    return;
  }

  const threadMatch = pathname.match(/^\/v1\/threads\/([^/]+)$/);
  if (method === "GET" && threadMatch) {
    const thread = await threadService.getThread(decodeURIComponent(threadMatch[1]!), {
      includeTurns: url.searchParams.get("include_turns") === "true"
    });
    sendJson(res, 200, { thread });
    return;
  }

  const threadNameMatch = pathname.match(/^\/v1\/threads\/([^/]+)\/name$/);
  if (method === "POST" && threadNameMatch) {
    const capability = requireCapability(threadService, "renameThread");
    const threadId = decodeURIComponent(threadNameMatch[1]!);
    const body = RenameThreadBodySchema.parse(await readJson(req));
    sendJson(res, 200, { thread: await capability(threadId, { title: body.title }) });
    return;
  }

  const threadArchiveMatch = pathname.match(/^\/v1\/threads\/([^/]+)\/archive$/);
  if (method === "POST" && threadArchiveMatch) {
    const threadId = decodeURIComponent(threadArchiveMatch[1]!);
    const body = ArchiveThreadBodySchema.parse(await readJson(req));
    if (typeof threadService.archiveThread !== "function") {
      sendJson(res, 200, {
        supported: false,
        archived: false,
        thread_id: threadId,
        reason: "Thread archive is not supported by this bridge runtime."
      });
      return;
    }
    sendJson(res, 200, await threadService.archiveThread(threadId, { archived: body.archived }));
    return;
  }

  const runStreamMatch = pathname.match(/^\/v1\/threads\/([^/]+)\/runs\/stream$/);
  if (method === "POST" && runStreamMatch) {
    const threadId = decodeURIComponent(runStreamMatch[1]!);
    const body = RunStreamBodySchema.parse(await readJson(req));
    const run = await runRegistry.startRun(threadId, body);
    if (res.destroyed) {
      return;
    }
    await streamRunEvents(req, res, runRegistry, run.run_id, 0, config.heartbeatMs);
    return;
  }

  const runStartMatch = pathname.match(/^\/v1\/threads\/([^/]+)\/runs$/);
  if (method === "POST" && runStartMatch) {
    const threadId = decodeURIComponent(runStartMatch[1]!);
    const body = RunStreamBodySchema.parse(await readJson(req));
    sendJson(res, 202, { run: await runRegistry.startRun(threadId, body) });
    return;
  }

  if (method === "GET" && pathname === "/v1/runs/active") {
    const threadId = url.searchParams.get("thread_id");
    const cwd = url.searchParams.get("cwd");
    sendJson(res, 200, { data: runRegistry.listActiveRuns({ threadId, cwd }) });
    return;
  }

  const runEventsMatch = pathname.match(/^\/v1\/runs\/([^/]+)\/events\/stream$/);
  if (method === "GET" && runEventsMatch) {
    const runId = decodeURIComponent(runEventsMatch[1]!);
    const sinceSeq = parseNonNegativeInt(url.searchParams.get("since_seq")) ?? 0;
    await streamRunEvents(req, res, runRegistry, runId, sinceSeq, config.heartbeatMs);
    return;
  }

  const runMatch = pathname.match(/^\/v1\/runs\/([^/]+)$/);
  if (method === "GET" && runMatch) {
    sendJson(res, 200, { run: runRegistry.getRun(decodeURIComponent(runMatch[1]!)) });
    return;
  }

  const cancelMatch = pathname.match(/^\/v1\/threads\/([^/]+)\/cancel$/);
  if (method === "POST" && cancelMatch) {
    const threadId = decodeURIComponent(cancelMatch[1]!);
    const body = CancelRunBodySchema.parse(await readJson(req));
    const result = runRegistry.cancelRun(threadId, body.run_id);
    sendJson(res, result.cancelled ? 200 : 404, result);
    return;
  }

  if (method === "GET" && pathname === "/v1/workspaces") {
    sendJson(res, 200, {
      data: await threadService.listWorkspaces(),
      allowlist_file: config.workspaceAllowlistFile
    });
    return;
  }

  if (method === "POST" && pathname === "/v1/workspaces/remove") {
    const body = WorkspacePathBodySchema.parse(await readJson(req));
    sendJson(res, 200, workspaceService.removeFromFileAllowlist(body.path));
    return;
  }

  if (method === "POST" && pathname === "/v1/workspaces/add") {
    const body = WorkspacePathBodySchema.parse(await readJson(req));
    sendJson(res, 200, workspaceService.addToFileAllowlist(body.path));
    return;
  }

  if (method === "POST" && pathname === "/v1/workspaces/restore") {
    const body = WorkspacePathBodySchema.parse(await readJson(req));
    sendJson(res, 200, workspaceService.restoreToFileAllowlist(body.path));
    return;
  }

  if (method === "GET" && pathname === "/v1/settings/models") {
    const capability = requireCapability(threadService, "listModels");
    sendJson(res, 200, await capability({
      includeHidden: url.searchParams.get("include_hidden") === "true",
      limit: parsePositiveInt(url.searchParams.get("limit")) ?? 50,
      cursor: url.searchParams.get("cursor")
    }));
    return;
  }

  if (method === "GET" && pathname === "/v1/settings/config") {
    const capability = requireCapability(threadService, "readConfig");
    sendJson(res, 200, await capability());
    return;
  }

  if (method === "POST" && pathname === "/v1/settings/config") {
    const capability = requireCapability(threadService, "writeConfig");
    const body = WriteConfigBodySchema.parse(await readJson(req));
    const input: { keyPath: string; value: unknown; mergeStrategy?: "replace" | "upsert" } = {
      keyPath: body.key_path,
      value: body.value
    };
    if (body.merge_strategy !== undefined) {
      input.mergeStrategy = body.merge_strategy;
    }
    sendJson(
      res,
      200,
      await capability(input)
    );
    return;
  }

  if (method === "GET" && pathname === "/v1/settings/account") {
    const capability = requireCapability(threadService, "readAccount");
    sendJson(res, 200, await capability());
    return;
  }

  if (method === "GET" && pathname === "/v1/settings/features") {
    const capability = requireCapability(threadService, "listExperimentalFeatures");
    sendJson(res, 200, await capability({
      limit: parsePositiveInt(url.searchParams.get("limit")) ?? 50,
      cursor: url.searchParams.get("cursor")
    }));
    return;
  }

  if (method === "GET" && pathname === "/v1/apps") {
    const capability = requireCapability(threadService, "listApps");
    sendJson(res, 200, await capability({
      limit: parsePositiveInt(url.searchParams.get("limit")) ?? 50,
      cursor: url.searchParams.get("cursor"),
      threadId: url.searchParams.get("thread_id"),
      forceRefetch: url.searchParams.get("force_refetch") === "true"
    }));
    return;
  }

  if (method === "GET" && pathname === "/v1/skills") {
    const capability = requireCapability(threadService, "listSkills");
    sendJson(res, 200, await capability({
      cwd: url.searchParams.get("cwd"),
      forceReload: url.searchParams.get("force_reload") === "true"
    }));
    return;
  }

  if (method === "GET" && pathname === "/v1/mcp/servers") {
    const capability = requireCapability(threadService, "listMcpServers");
    sendJson(res, 200, await capability({
      detail: parseMcpDetail(url.searchParams.get("detail")) ?? "full",
      limit: parsePositiveInt(url.searchParams.get("limit")) ?? 50,
      cursor: url.searchParams.get("cursor")
    }));
    return;
  }

  if (method === "POST" && pathname === "/v1/mcp/resources/read") {
    const capability = requireCapability(threadService, "readMcpResource");
    const body = McpResourceReadBodySchema.parse(await readJson(req));
    sendJson(res, 200, await capability({
      server: body.server,
      uri: body.uri,
      threadId: body.thread_id ?? null
    }));
    return;
  }

  if (method === "POST" && pathname === "/v1/mcp/reload") {
    const capability = requireCapability(threadService, "reloadMcpServers");
    sendJson(res, 200, await capability());
    return;
  }

  const approvalMatch = pathname.match(/^\/v1\/approvals\/([^/]+)\/respond$/);
  if (method === "POST" && approvalMatch) {
    const capability = requireCapability(threadService, "respondApproval");
    const body = ApprovalResponseBodySchema.parse(await readJson(req));
    const approvalId = decodeURIComponent(approvalMatch[1]!);
    sendJson(
      res,
      200,
      await capability(approvalId, {
        decision: body.decision,
        payload: body.payload
      })
    );
    return;
  }

  if (method === "GET" && pathname === "/v1/setup/ssh/status") {
    sendJson(res, 200, {
      mode: "bridge",
      local_url: `http://${config.host}:${config.port}`,
      remote_api: `${config.host}:${config.port}`,
      connected: true,
      last_health_check_ms: null,
      active_endpoint: null
    });
    return;
  }

  throw new AppError(404, "not_found", `Route not found: ${method} ${pathname}`);
}

function buildHealthResponse(
  config: BridgeConfig,
  runtimeHealth: CodexRuntimeHealth,
  elapsedMs: number
) {
  return {
    status: runtimeHealth.ready ? "ok" : "degraded",
    codex_ready: runtimeHealth.ready,
    auth: runtimeHealth.auth,
    bridge_version: config.version,
    codex_cli_version: runtimeHealth.codexCliVersion,
    active_transport: runtimeHealth.runtime,
    checks: runtimeHealth.checks,
    elapsed_ms: Math.round(elapsedMs)
  };
}

function buildCapabilitiesResponse(
  threadService: BridgeThreadService,
  workspaceService: WorkspaceService
) {
  return {
    threads: {
      rename: typeof threadService.renameThread === "function",
      archive: typeof threadService.archiveThread === "function"
    },
    mcp: {
      list: typeof threadService.listMcpServers === "function",
      read: typeof threadService.readMcpResource === "function",
      reload: typeof threadService.reloadMcpServers === "function"
    },
    apps: {
      list: typeof threadService.listApps === "function"
    },
    skills: {
      list: typeof threadService.listSkills === "function"
    },
    workspaces: workspaceService.capabilities()
  };
}

async function streamRunEvents(
  req: IncomingMessage,
  res: ServerResponse,
  runRegistry: RunRegistry,
  runId: string,
  sinceSeq: number,
  heartbeatMs: number
) {
  const sse = new SseWriter(res);
  const subscription = runRegistry.subscribe(runId, sinceSeq);
  let clientClosed = false;

  sse.open();
  req.on("close", () => {
    clientClosed = true;
    subscription.close();
  });

  const heartbeat = setInterval(() => {
    if (!clientClosed) {
      sse.write("heartbeat", { ts: new Date().toISOString(), run_id: runId });
    }
  }, heartbeatMs);
  heartbeat.unref();

  try {
    for await (const event of subscription.events) {
      if (clientClosed) {
        break;
      }
      sse.write(event.event, event.data);
    }
  } finally {
    clearInterval(heartbeat);
    subscription.close();
    if (!res.writableEnded && !res.destroyed) {
      sse.end();
    }
  }
}

function createDefaultThreadService(
  config: BridgeConfig,
  workspaceService: WorkspaceService,
  appServerClient: AppServerClient | undefined
): BridgeThreadService {
  if (config.runtime === "app-server") {
    return new AppServerBridgeService({
      config,
      client: appServerClient ?? new AppServerClient(),
      workspaceService
    });
  }

  return new ThreadService({
    config,
    runtime: createRuntime(config),
    store: new InMemoryThreadStore(),
    workspaceService
  });
}

async function normalizeListThreadsResponse(value: unknown) {
  const resolved = await value;
  if (Array.isArray(resolved)) {
    return { data: resolved };
  }
  return resolved;
}

function parseThreadQuery(url: URL): BridgeThreadQuery {
  return {
    cursor: url.searchParams.get("cursor"),
    limit: parsePositiveInt(url.searchParams.get("limit")),
    cwd: url.searchParams.get("cwd"),
    searchTerm: url.searchParams.get("search"),
    archived: parseOptionalBoolean(url.searchParams.get("archived"))
  };
}

function parsePositiveInt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalBoolean(value: string | null) {
  if (value === null) {
    return null;
  }
  return value === "true";
}

function parseMcpDetail(value: string | null) {
  if (value === "full" || value === "toolsAndAuthOnly") {
    return value;
  }
  return null;
}

function requireCapability<T extends keyof BridgeThreadService>(
  service: BridgeThreadService,
  capability: T
): NonNullable<BridgeThreadService[T]> {
  const value = service[capability];
  if (typeof value !== "function") {
    throw new AppError(
      501,
      "capability_not_available",
      `Bridge runtime does not support capability: ${String(capability)}`
    );
  }
  return value.bind(service) as NonNullable<BridgeThreadService[T]>;
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1024 * 1024) {
      throw new AppError(413, "payload_too_large", "JSON body is larger than 1 MiB.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  if (res.headersSent) {
    return;
  }

  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

function applyCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Accept,Authorization,Content-Type,X-Requested-With"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");
}

function sendError(res: ServerResponse, error: unknown) {
  const payload = getErrorPayload(error);
  sendJson(res, payload.statusCode, { error: payload.error });
}

function trimTrailingSlash(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}
