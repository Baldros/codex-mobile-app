import { SseStreamDecoder } from "./sse";
import type {
  BridgeCapabilities,
  BridgeHealth,
  BridgeRunSummary,
  BridgeSseEvent,
  BridgeThread,
  CodexAccountResponse,
  CodexConfigResponse,
  CodexModel,
  McpResourceReadResponse,
  McpServerStatusResponse,
  PendingApproval,
  RunStreamBody,
  ThreadArchiveResponse,
  WorkspaceMutationResponse,
  WorkspaceEntry
} from "../domain/bridge";

type ListThreadsParams = {
  cwd?: string;
  limit?: number;
  cursor?: string;
  search?: string;
};

type ListResponse<T> = {
  data: T[];
  next_cursor?: string | null;
  backwards_cursor?: string | null;
  nextCursor?: string | null;
};

type BridgeClientOptions = {
  ensureTransportReady?: (() => Promise<void>) | undefined;
};

export class BridgeClient {
  constructor(
    readonly baseUrl: string,
    private readonly options: BridgeClientOptions = {}
  ) {}

  health() {
    return this.requestJson<BridgeHealth>("/health");
  }

  capabilities() {
    return this.requestJson<BridgeCapabilities>("/v1/capabilities");
  }

  async listWorkspaces() {
    return this.requestJson<{ data: WorkspaceEntry[]; allowlist_file: string }>("/v1/workspaces");
  }

  async removeWorkspace(path: string) {
    return this.requestJson<WorkspaceMutationResponse>("/v1/workspaces/remove", {
      method: "POST",
      body: JSON.stringify({ path })
    });
  }

  async restoreWorkspace(path: string) {
    return this.requestJson<WorkspaceMutationResponse>("/v1/workspaces/restore", {
      method: "POST",
      body: JSON.stringify({ path })
    });
  }

  async listThreads(params: ListThreadsParams = {}) {
    const query = new URLSearchParams();
    query.set("limit", String(params.limit ?? 25));
    if (params.cwd) {
      query.set("cwd", params.cwd);
    }
    if (params.cursor) {
      query.set("cursor", params.cursor);
    }
    if (params.search) {
      query.set("search", params.search);
    }

    return this.requestJson<ListResponse<BridgeThread>>(`/v1/threads?${query.toString()}`);
  }

  async createThread(input: { title: string; workspace: string }) {
    return this.requestJson<{ thread: BridgeThread }>("/v1/threads", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async getThread(threadId: string, options: { includeTurns?: boolean } = {}) {
    const query = new URLSearchParams();
    if (options.includeTurns) {
      query.set("include_turns", "true");
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.requestJson<{ thread: BridgeThread }>(
      `/v1/threads/${encodeURIComponent(threadId)}${suffix}`
    );
  }

  async renameThread(threadId: string, title: string) {
    return this.requestJson<{ thread: BridgeThread }>(
      `/v1/threads/${encodeURIComponent(threadId)}/name`,
      {
        method: "POST",
        body: JSON.stringify({ title })
      }
    );
  }

  async archiveThread(threadId: string, archived: boolean) {
    return this.requestJson<ThreadArchiveResponse>(
      `/v1/threads/${encodeURIComponent(threadId)}/archive`,
      {
        method: "POST",
        body: JSON.stringify({ archived })
      }
    );
  }

  async listModels(limit = 50) {
    return this.requestJson<{ data: CodexModel[]; nextCursor?: string | null }>(
      `/v1/settings/models?limit=${limit}`
    );
  }

  async readConfig() {
    return this.requestJson<CodexConfigResponse>("/v1/settings/config");
  }

  async readAccount() {
    return this.requestJson<CodexAccountResponse>("/v1/settings/account");
  }

  async writeConfig(keyPath: string, value: unknown) {
    return this.requestJson<{ written?: boolean }>("/v1/settings/config", {
      method: "POST",
      body: JSON.stringify({
        key_path: keyPath,
        value,
        merge_strategy: "replace"
      })
    });
  }

  async listMcpServers(params: { detail?: "full" | "toolsAndAuthOnly"; limit?: number; cursor?: string | null } = {}) {
    const query = new URLSearchParams();
    query.set("detail", params.detail ?? "full");
    query.set("limit", String(params.limit ?? 50));
    if (params.cursor) {
      query.set("cursor", params.cursor);
    }

    return this.requestJson<McpServerStatusResponse>(`/v1/mcp/servers?${query.toString()}`);
  }

  async readMcpResource(input: { server: string; uri: string; threadId?: string | null }) {
    return this.requestJson<McpResourceReadResponse>("/v1/mcp/resources/read", {
      method: "POST",
      body: JSON.stringify({
        server: input.server,
        uri: input.uri,
        thread_id: input.threadId ?? null
      })
    });
  }

  async reloadMcpServers() {
    return this.requestJson<Record<string, never>>("/v1/mcp/reload", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  async respondApproval(approvalId: string, decision: string, payload?: unknown) {
    return this.requestJson<{ resolved: boolean }>(
      `/v1/approvals/${encodeURIComponent(approvalId)}/respond`,
      {
        method: "POST",
        body: JSON.stringify({ decision, payload })
      }
    );
  }

  async cancelRun(threadId: string, runId?: string) {
    return this.requestJson<{ cancelled: boolean }>(
      `/v1/threads/${encodeURIComponent(threadId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ run_id: runId })
      }
    );
  }

  async listActiveRuns(params: { threadId?: string; cwd?: string } = {}) {
    const query = new URLSearchParams();
    if (params.threadId) {
      query.set("thread_id", params.threadId);
    }
    if (params.cwd) {
      query.set("cwd", params.cwd);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.requestJson<ListResponse<BridgeRunSummary>>(`/v1/runs/active${suffix}`);
  }

  async streamRun(
    threadId: string,
    body: RunStreamBody,
    onEvent: (event: BridgeSseEvent) => void,
    signal?: AbortSignal
  ) {
    const init: RequestInit = {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    };
    if (signal) {
      init.signal = signal;
    }

    await this.readSseStream(
      `/v1/threads/${encodeURIComponent(threadId)}/runs/stream`,
      init,
      onEvent
    );
  }

  async streamRunEvents(
    runId: string,
    onEvent: (event: BridgeSseEvent) => void,
    signal?: AbortSignal,
    sinceSeq = 0
  ) {
    const init: RequestInit = {
      method: "GET",
      headers: {
        Accept: "text/event-stream"
      }
    };
    if (signal) {
      init.signal = signal;
    }

    await this.readSseStream(
      `/v1/runs/${encodeURIComponent(runId)}/events/stream?since_seq=${sinceSeq}`,
      init,
      onEvent
    );
  }

  private async requestJson<T>(path: string, init: RequestInit = {}) {
    await this.options.ensureTransportReady?.();

    const response = await fetch(this.url(path), {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      throw await toBridgeError(response);
    }

    return (await response.json()) as T;
  }

  private url(path: string) {
    const normalizedBase = this.baseUrl.replace(/\/+$/, "");
    return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async readSseStream(
    path: string,
    init: RequestInit,
    onEvent: (event: BridgeSseEvent) => void
  ) {
    await this.options.ensureTransportReady?.();

    const response = await fetch(this.url(path), init);

    if (!response.ok) {
      throw await toBridgeError(response);
    }

    if (!response.body || typeof response.body.getReader !== "function") {
      const text = await response.text();
      emitSseText(text, onEvent);
      return;
    }

    const decoder = new SseStreamDecoder();
    const textDecoder = createTextDecoder();
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        for (const event of decoder.flush()) {
          onEvent(event);
        }
        break;
      }

      const chunk = decodeChunk(value, textDecoder);
      for (const event of decoder.push(chunk)) {
        onEvent(event);
      }
    }
  }
}

export function approvalSummary(approval: PendingApproval) {
  if (approval.command) {
    return Array.isArray(approval.command) ? approval.command.join(" ") : approval.command;
  }

  return approval.reason ?? approval.method ?? approval.approval_type ?? "Approval requested";
}

function emitSseText(text: string, onEvent: (event: BridgeSseEvent) => void) {
  const decoder = new SseStreamDecoder();
  for (const event of decoder.push(text)) {
    onEvent(event);
  }
  for (const event of decoder.flush()) {
    onEvent(event);
  }
}

function createTextDecoder() {
  if (typeof TextDecoder === "undefined") {
    return null;
  }
  return new TextDecoder("utf-8");
}

function decodeChunk(value: Uint8Array | undefined, decoder: TextDecoder | null) {
  if (!value) {
    return "";
  }

  if (decoder) {
    return decoder.decode(value, { stream: true });
  }

  return Array.from(value)
    .map((byte) => String.fromCharCode(byte))
    .join("");
}

async function toBridgeError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string; code?: string } };
    const message = payload.error?.message ?? payload.error?.code;
    return new Error(message ?? `Bridge request failed with ${response.status}`);
  } catch {
    return new Error(`Bridge request failed with ${response.status}`);
  }
}
