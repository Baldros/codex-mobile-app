import type {
  ApprovalMode,
  Input,
  ModelReasoningEffort,
  SandboxMode,
  ThreadEvent,
  WebSearchMode
} from "@openai/codex-sdk";

import type { BridgeRuntime } from "../config.js";

export type RuntimeThreadEvent = ThreadEvent;
export type RuntimeThreadInput = Input;

export type CodexRuntimeHealth = {
  runtime: BridgeRuntime;
  ready: boolean;
  auth: "ok" | "missing" | "unknown";
  codexCliVersion: string | null;
  checks: Record<string, "ok" | "failed" | "skipped">;
};

export type RuntimeThreadOptions = {
  model?: string;
  sandboxMode?: SandboxMode;
  workingDirectory: string;
  skipGitRepoCheck: boolean;
  modelReasoningEffort?: ModelReasoningEffort;
  networkAccessEnabled?: boolean;
  webSearchMode?: WebSearchMode;
  approvalPolicy?: ApprovalMode;
  additionalDirectories?: string[];
};

export type RuntimeTurnOptions = {
  signal: AbortSignal;
};

export type RuntimeThread = {
  get id(): string | null;
  runStreamed(
    input: RuntimeThreadInput,
    options: RuntimeTurnOptions
  ): Promise<AsyncGenerator<RuntimeThreadEvent>>;
};

export type CodexRuntime = {
  readonly name: BridgeRuntime;
  health(): Promise<CodexRuntimeHealth>;
  startThread(options: RuntimeThreadOptions): RuntimeThread;
  resumeThread(id: string, options: RuntimeThreadOptions): RuntimeThread;
};
