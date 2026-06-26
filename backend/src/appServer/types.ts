import type { CodexRuntimeHealth } from "../runtime/types.js";
import type { BridgeSseEvent } from "../sse.js";
import type { RunStreamBody } from "../validation.js";
import type { WorkspaceEntry } from "../workspaces/WorkspaceService.js";

export type BridgeThreadQuery = {
  cursor?: string | null;
  limit?: number | null;
  cwd?: string | null;
  searchTerm?: string | null;
  archived?: boolean | null;
};

export type BridgeThreadService = {
  health(): Promise<CodexRuntimeHealth>;
  listThreads(query?: BridgeThreadQuery): unknown[] | Promise<unknown>;
  createThread(input: { title?: string | undefined; workspace?: string | undefined }): unknown | Promise<unknown>;
  getThread(threadId: string, options?: { includeTurns?: boolean }): unknown | Promise<unknown>;
  renameThread?(threadId: string, input: { title: string }): unknown | Promise<unknown>;
  archiveThread?(threadId: string, input: { archived: boolean }): unknown | Promise<unknown>;
  compactThread?(threadId: string): unknown | Promise<unknown>;
  runThread(
    threadId: string,
    input: RunStreamBody,
    externalSignal: AbortSignal
  ): AsyncGenerator<BridgeSseEvent>;
  cancelRun(threadId: string, runId?: string): unknown | Promise<unknown>;
  listWorkspaces(): WorkspaceEntry[] | Promise<WorkspaceEntry[]>;
  listModels?(params?: { includeHidden?: boolean; limit?: number; cursor?: string | null }): Promise<unknown>;
  readConfig?(): Promise<unknown>;
  writeConfig?(input: { keyPath: string; value: unknown; mergeStrategy?: "replace" | "upsert" }): Promise<unknown>;
  readAccount?(): Promise<unknown>;
  listExperimentalFeatures?(params?: { limit?: number; cursor?: string | null }): Promise<unknown>;
  respondApproval?(requestId: string, input: { decision: string; payload?: unknown }): Promise<unknown>;
  listApps?(params?: {
    limit?: number;
    cursor?: string | null;
    threadId?: string | null;
    forceRefetch?: boolean;
  }): Promise<unknown>;
  listSkills?(params?: { cwd?: string | null; forceReload?: boolean }): Promise<unknown>;
  listMcpServers?(params?: {
    detail?: "full" | "toolsAndAuthOnly";
    limit?: number;
    cursor?: string | null;
  }): Promise<unknown>;
  readMcpResource?(input: { server: string; uri: string; threadId?: string | null }): Promise<unknown>;
  reloadMcpServers?(): Promise<unknown>;
};
