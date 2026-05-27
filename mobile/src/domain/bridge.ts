export type BridgeHealth = {
  status: "ok" | "degraded" | "error" | string;
  codex_ready: boolean;
  auth: "ok" | "missing" | "expired" | "unknown" | string;
  bridge_version: string;
  codex_cli_version: string | null;
  active_transport: string;
  checks?: Record<string, string>;
  elapsed_ms?: number;
};

export type WorkspaceEntry = {
  path: string;
  name: string;
  exists: boolean;
  is_git_repo: boolean;
  source: "file" | "env" | "fallback" | string;
};

export type BridgeThread = {
  id: string;
  session_id?: string;
  title: string;
  preview: string;
  cwd?: string;
  created_at?: string | null;
  updated_at?: string | null;
  status?: unknown;
  runtime_thread_id?: string;
  model_provider?: string;
  source?: string;
  path?: string | null;
  turns?: unknown[];
};

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type CodexReasoningOption = {
  reasoningEffort: ReasoningEffort;
  description?: string;
};

export type CodexServiceTier = {
  id: string;
  name?: string;
  description?: string;
};

export type CodexModel = {
  id: string;
  model?: string;
  displayName?: string;
  description?: string;
  hidden?: boolean;
  isDefault?: boolean;
  supportedReasoningEfforts?: CodexReasoningOption[];
  defaultReasoningEffort?: ReasoningEffort;
  serviceTiers?: CodexServiceTier[];
  defaultServiceTier?: string | null;
  additionalSpeedTiers?: string[];
};

export type CodexConfigResponse = {
  config: Record<string, unknown>;
  layers?: Record<string, unknown>;
};

export type RunStreamBody = {
  message: string;
  cwd?: string;
  approval_policy?: ApprovalPolicy;
  sandbox_mode?: SandboxMode;
  model?: string;
  model_reasoning_effort?: ReasoningEffort;
  service_tier?: string;
  skip_git_repo_check?: boolean;
  network_access_enabled?: boolean;
  web_search_mode?: "disabled" | "cached" | "live";
  additional_directories?: string[];
};

export type BridgeSseEvent<T = Record<string, unknown>> = {
  event: string;
  data: T;
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  pending?: boolean;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail?: string | undefined;
  status: "running" | "done" | "failed" | "info";
};

export type PendingApproval = {
  approval_id: string;
  approval_type?: string;
  method?: string;
  thread_id?: string;
  run_id?: string;
  item_id?: string;
  reason?: string | null;
  command?: string | string[] | null;
  cwd?: string | null;
  available_decisions?: string[];
};

export type BridgePreferences = {
  baseUrl: string;
  selectedWorkspacePath: string | null;
  selectedModelId: string | null;
  reasoningEffort: ReasoningEffort;
  approvalPolicy: ApprovalPolicy;
  sandboxMode: SandboxMode;
  serviceTier: string | null;
  networkAccessEnabled: boolean;
};
