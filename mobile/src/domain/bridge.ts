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

export type DirectoryEntry = {
  name: string;
  path: string;
  is_git_repo: boolean;
};

export type DirectoryRootsResponse = {
  data: DirectoryEntry[];
};

export type DirectoryChildrenResponse = {
  path: string;
  name: string;
  parent: string | null;
  children: DirectoryEntry[];
  truncated: boolean;
};

export type BridgeCapabilities = {
  threads: {
    rename: boolean;
    archive: boolean;
    compact: boolean;
  };
  mcp?: {
    list: boolean;
    read: boolean;
    reload: boolean;
  };
  apps?: {
    list: boolean;
  };
  skills?: {
    list: boolean;
  };
  workspaces: {
    add: boolean;
    remove: boolean;
    restore: boolean;
  };
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

export type BridgeRunSummary = {
  run_id: string;
  thread_id: string;
  cwd?: string;
  status: "starting" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled" | string;
  created_at: string;
  updated_at: string;
  last_event_seq: number;
  error?: string | null;
};

export type ThreadArchiveResponse = {
  supported: boolean;
  archived: boolean;
  thread_id: string;
  reason?: string;
  thread?: BridgeThread | null;
};

export type ThreadCompactResponse = {
  supported: boolean;
  compacted: boolean;
  thread_id: string;
  reason?: string;
};

export type UploadedImage = {
  id: string;
  filename: string;
  path: string;
  mime_type: string;
  size_bytes: number;
};

export type ImageUploadRequest = {
  filename?: string;
  mimeType: string;
  dataBase64: string;
};

export type ImageUploadResponse = {
  image: UploadedImage;
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

export type CodexAccount = {
  type?: string;
  email?: string;
  planType?: string;
  [key: string]: unknown;
};

export type RateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type CreditsSnapshot = {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
};

export type RateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: CreditsSnapshot | null;
  planType: string | null;
  rateLimitReachedType: string | null;
};

export type CodexRateLimitsResponse = {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot | undefined> | null;
};

export type CodexAccountResponse = {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
  rateLimits?: CodexRateLimitsResponse | null;
  rateLimitsError?: string | null;
};

export type McpResource = {
  name: string;
  uri: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  size?: number | null;
};

export type McpResourceTemplate = {
  name: string;
  uriTemplate: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
};

export type McpTool = {
  name: string;
  title?: string | null;
  description?: string | null;
  inputSchema?: unknown;
  outputSchema?: unknown;
};

export type McpServerStatus = {
  name: string;
  authStatus: "unsupported" | "notLoggedIn" | "bearerToken" | "oAuth" | string;
  resources: McpResource[];
  resourceTemplates: McpResourceTemplate[];
  tools: Record<string, McpTool>;
};

export type McpServerStatusResponse = {
  data: McpServerStatus[];
  nextCursor?: string | null;
};

export type McpResourceContent = {
  uri: string;
  mimeType?: string | null;
  text?: string;
  blob?: string;
};

export type McpResourceReadResponse = {
  contents: McpResourceContent[];
};

export type CodexApp = {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  isAccessible?: boolean;
  isEnabled?: boolean;
  installUrl?: string | null;
};

export type CodexAppsResponse = {
  data: CodexApp[];
  nextCursor?: string | null;
};

export type CodexSkill = {
  name: string;
  path: string;
  description?: string;
  shortDescription?: string | null;
  enabled: boolean;
  scope?: string;
  interface?: {
    displayName?: string | null;
    shortDescription?: string | null;
  } | null;
};

export type CodexSkillsListEntry = {
  cwd: string;
  skills: CodexSkill[];
  errors: Array<{ message: string; path: string }>;
};

export type CodexSkillsResponse = {
  data: CodexSkillsListEntry[];
};

export type RunInputItem =
  | {
      type: "mention";
      name: string;
      path: string;
    }
  | {
      type: "skill";
      name: string;
      path: string;
    }
  | {
      type: "mcp_resource";
      server: string;
      uri: string;
      name?: string;
      title?: string;
    }
  | {
      type: "image";
      path: string;
      name?: string;
      mime_type?: string;
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
  input_items?: RunInputItem[];
};

export type BridgeSseEvent<T = Record<string, unknown>> = {
  event: string;
  data: T;
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatActivityStatus = "running" | "done" | "failed" | "info";

export type ChatTextPart = {
  id: string;
  type: "text";
  text: string;
  pending?: boolean;
};

export type ChatActivityPart = {
  id: string;
  type: "activity";
  title: string;
  detail?: string | undefined;
  output?: string | undefined;
  status: ChatActivityStatus;
  toolDetails?: Record<string, unknown> | undefined;
};

export type ChatApprovalPart = {
  id: string;
  type: "approval";
  approval: PendingApproval;
  status: "pending" | "answered";
  decision?: string | undefined;
};

export type ChatMessagePart = ChatTextPart | ChatActivityPart | ChatApprovalPart;

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  pending?: boolean;
  parts?: ChatMessagePart[];
  deliveryStatus?: "sending" | "sent" | "failed";
  deliveryError?: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail?: string | undefined;
  status: "running" | "done" | "failed" | "info";
  toolDetails?: Record<string, unknown> | undefined;
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

export type WorkspaceMutationResponse = {
  supported: boolean;
  added?: boolean;
  removed?: boolean;
  restored?: boolean;
  path: string;
  reason?: string;
};

export type BridgePreferences = {
  baseUrl: string;
  selectedWorkspacePath: string | null;
  selectedThreadId: string | null;
  selectedModelId: string | null;
  reasoningEffort: ReasoningEffort;
  approvalPolicy: ApprovalPolicy;
  sandboxMode: SandboxMode;
  serviceTier: string | null;
  networkAccessEnabled: boolean;
};
