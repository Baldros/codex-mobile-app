import { randomUUID } from "node:crypto";

import type { BridgeConfig } from "../config.js";
import { AppError } from "../errors.js";
import type { BridgeSseEvent } from "../sse.js";
import type { RunStreamBody } from "../validation.js";
import { mapRuntimeEvent } from "../runtime/mapRuntimeEvent.js";
import type { CodexRuntime, RuntimeThread, RuntimeThreadOptions } from "../runtime/types.js";
import { WorkspaceService } from "../workspaces/WorkspaceService.js";

import { InMemoryThreadStore, type ThreadRecord } from "./InMemoryThreadStore.js";

type ActiveRun = {
  threadId: string;
  runId: string;
  controller: AbortController;
};

type RuntimeSession = {
  runtimeThread: RuntimeThread;
  cwd: string;
};

export class ThreadService {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly sessions = new Map<string, RuntimeSession>();

  constructor(
    private readonly deps: {
      config: BridgeConfig;
      runtime: CodexRuntime;
      store: InMemoryThreadStore;
      workspaceService?: WorkspaceService;
    }
  ) {
    this.workspaceService = deps.workspaceService ?? new WorkspaceService(deps.config);
  }

  private readonly workspaceService: WorkspaceService;

  health() {
    return this.deps.runtime.health();
  }

  createThread(input: { title?: string | undefined; workspace?: string | undefined }) {
    const cwd = this.resolveWorkspace(input.workspace);
    return toPublicThread(this.deps.store.create({ title: input.title, cwd }));
  }

  listThreads() {
    return this.deps.store.list().map(toPublicThread);
  }

  listWorkspaces() {
    return this.workspaceService.listWorkspaces();
  }

  getThread(threadId: string) {
    return toPublicThread(this.getThreadRecord(threadId));
  }

  async *runThread(
    threadId: string,
    input: RunStreamBody,
    externalSignal: AbortSignal
  ): AsyncGenerator<BridgeSseEvent> {
    const thread = this.getThreadRecord(threadId);
    const cwd = this.resolveWorkspace(input.cwd ?? thread.cwd);
    const runId = `run_${randomUUID()}`;
    const controller = new AbortController();
    const abortListener = () => controller.abort();
    externalSignal.addEventListener("abort", abortListener, { once: true });

    this.activeRuns.set(runId, { threadId, runId, controller });

    yield {
      event: "run_started",
      data: {
        thread_id: threadId,
        run_id: runId
      }
    };

    try {
      const runtimeThread = this.getOrCreateRuntimeThread(thread, cwd, input);
      const events = await runtimeThread.runStreamed(input.message, {
        signal: controller.signal
      });

      let sawTerminalEvent = false;
      for await (const runtimeEvent of events) {
        if (runtimeEvent.type === "thread.started") {
          this.deps.store.update(threadId, { runtimeThreadId: runtimeEvent.thread_id, cwd });
        }

        if (runtimeEvent.type === "turn.completed" || runtimeEvent.type === "turn.failed") {
          sawTerminalEvent = true;
        }

        for (const bridgeEvent of mapRuntimeEvent(runtimeEvent, { threadId, runId })) {
          yield bridgeEvent;
        }
      }

      if (!sawTerminalEvent) {
        yield {
          event: "done",
          data: {
            thread_id: threadId,
            run_id: runId,
            status: "completed"
          }
        };
      }
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        yield {
          event: "done",
          data: {
            thread_id: threadId,
            run_id: runId,
            status: "cancelled"
          }
        };
        return;
      }

      yield {
        event: "error",
        data: {
          thread_id: threadId,
          run_id: runId,
          message: error instanceof Error ? error.message : "Unexpected runtime error."
        }
      };
      yield {
        event: "done",
        data: {
          thread_id: threadId,
          run_id: runId,
          status: "failed"
        }
      };
    } finally {
      externalSignal.removeEventListener("abort", abortListener);
      this.activeRuns.delete(runId);
    }
  }

  cancelRun(threadId: string, runId?: string) {
    if (runId) {
      const active = this.activeRuns.get(runId);
      if (!active || active.threadId !== threadId) {
        return { cancelled: false, thread_id: threadId, run_id: runId };
      }

      active.controller.abort();
      return { cancelled: true, thread_id: threadId, run_id: runId };
    }

    const cancelledRunIds: string[] = [];
    for (const active of this.activeRuns.values()) {
      if (active.threadId === threadId) {
        active.controller.abort();
        cancelledRunIds.push(active.runId);
      }
    }

    return {
      cancelled: cancelledRunIds.length > 0,
      thread_id: threadId,
      run_ids: cancelledRunIds
    };
  }

  private getThreadRecord(threadId: string) {
    const thread = this.deps.store.get(threadId);
    if (!thread) {
      throw new AppError(404, "thread_not_found", `Thread not found: ${threadId}`);
    }
    return thread;
  }

  private getOrCreateRuntimeThread(thread: ThreadRecord, cwd: string, input: RunStreamBody) {
    const existing = this.sessions.get(thread.id);
    if (existing && existing.cwd === cwd) {
      return existing.runtimeThread;
    }

    const options: RuntimeThreadOptions = {
      workingDirectory: cwd,
      skipGitRepoCheck: input.skip_git_repo_check ?? this.deps.config.defaultSkipGitRepoCheck
    };

    const model = input.model ?? this.deps.config.defaultModel;
    if (model !== null && model !== undefined) {
      options.model = model;
    }
    if (input.approval_policy !== undefined) {
      options.approvalPolicy = input.approval_policy;
    }
    if (input.sandbox_mode !== undefined) {
      options.sandboxMode = input.sandbox_mode;
    }
    if (input.model_reasoning_effort !== undefined) {
      options.modelReasoningEffort = input.model_reasoning_effort;
    }
    if (input.network_access_enabled !== undefined) {
      options.networkAccessEnabled = input.network_access_enabled;
    }
    if (input.web_search_mode !== undefined) {
      options.webSearchMode = input.web_search_mode;
    }
    if (input.additional_directories !== undefined) {
      options.additionalDirectories = input.additional_directories.map((dir) =>
        this.workspaceService.assertAllowed(dir)
      );
    }

    const runtimeThread = thread.runtimeThreadId
      ? this.deps.runtime.resumeThread(thread.runtimeThreadId, options)
      : this.deps.runtime.startThread(options);

    this.sessions.set(thread.id, { runtimeThread, cwd });
    return runtimeThread;
  }

  private resolveWorkspace(candidate?: string) {
    return this.workspaceService.assertAllowed(candidate ?? this.deps.config.defaultWorkspace);
  }
}

function toPublicThread(thread: ThreadRecord) {
  return {
    id: thread.id,
    title: thread.title,
    cwd: thread.cwd,
    created_at: thread.createdAt,
    updated_at: thread.updatedAt,
    runtime_thread_id: thread.runtimeThreadId
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
