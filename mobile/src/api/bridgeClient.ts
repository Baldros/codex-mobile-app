import { SseStreamDecoder } from "./sse";
import type {
  BridgeHealth,
  BridgeSseEvent,
  BridgeThread,
  CodexConfigResponse,
  CodexModel,
  PendingApproval,
  RunStreamBody,
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

export class BridgeClient {
  constructor(readonly baseUrl: string) {}

  health() {
    return this.requestJson<BridgeHealth>("/health");
  }

  async listWorkspaces() {
    return this.requestJson<{ data: WorkspaceEntry[]; allowlist_file: string }>("/v1/workspaces");
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

  async listModels(limit = 50) {
    return this.requestJson<{ data: CodexModel[]; nextCursor?: string | null }>(
      `/v1/settings/models?limit=${limit}`
    );
  }

  async readConfig() {
    return this.requestJson<CodexConfigResponse>("/v1/settings/config");
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

  async streamRun(
    threadId: string,
    body: RunStreamBody,
    onEvent: (event: BridgeSseEvent) => void,
    signal?: AbortSignal
  ) {
    const response = await fetch(this.url(`/v1/threads/${encodeURIComponent(threadId)}/runs/stream`), {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal
    });

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

  private async requestJson<T>(path: string, init: RequestInit = {}) {
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
