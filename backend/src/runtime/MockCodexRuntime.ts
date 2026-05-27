import { randomUUID } from "node:crypto";

import type {
  CodexRuntime,
  CodexRuntimeHealth,
  RuntimeThread,
  RuntimeThreadEvent,
  RuntimeThreadOptions,
  RuntimeTurnOptions
} from "./types.js";

export type MockCodexRuntimeOptions = {
  delayMs?: number;
};

export class MockCodexRuntime implements CodexRuntime {
  readonly name = "mock" as const;

  constructor(private readonly options: MockCodexRuntimeOptions = {}) {}

  async health(): Promise<CodexRuntimeHealth> {
    return {
      runtime: this.name,
      ready: true,
      auth: "ok",
      codexCliVersion: "mock",
      checks: {
        codex_cli: "skipped",
        codex_auth: "skipped"
      }
    };
  }

  startThread(_options: RuntimeThreadOptions): RuntimeThread {
    return new MockRuntimeThread(this.options.delayMs ?? 0);
  }

  resumeThread(id: string, _options: RuntimeThreadOptions): RuntimeThread {
    return new MockRuntimeThread(this.options.delayMs ?? 0, id);
  }
}

class MockRuntimeThread implements RuntimeThread {
  private threadId: string | null;

  constructor(
    private readonly delayMs: number,
    id: string | null = null
  ) {
    this.threadId = id;
  }

  get id() {
    return this.threadId;
  }

  async runStreamed(input: string, options: RuntimeTurnOptions) {
    const threadId = this.threadId ?? `codex_mock_${randomUUID()}`;
    const delayMs = this.delayMs;
    this.threadId = threadId;

    async function* events(): AsyncGenerator<RuntimeThreadEvent> {
      yield { type: "thread.started", thread_id: threadId };
      yield { type: "turn.started" };
      await abortableDelay(delayMs, options.signal);
      yield {
        type: "item.completed",
        item: {
          id: `item_${randomUUID()}`,
          type: "agent_message",
          text: `Mock Codex response: ${input}`
        }
      };
      await abortableDelay(delayMs, options.signal);
      yield {
        type: "turn.completed",
        usage: {
          input_tokens: 1,
          cached_input_tokens: 0,
          output_tokens: 1,
          reasoning_output_tokens: 0
        }
      };
    }

    return events();
  }
}

function abortableDelay(delayMs: number, signal: AbortSignal) {
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      rejectAbort(reject);
      return;
    }

    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        rejectAbort(reject);
      },
      { once: true }
    );
  });
}

function rejectAbort(reject: (reason: Error) => void) {
  const error = new Error("Aborted");
  error.name = "AbortError";
  reject(error);
}
