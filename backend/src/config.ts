import path from "node:path";
import { z } from "zod";

const RuntimeSchema = z.enum(["app-server", "sdk", "mock"]);

const EnvSchema = z.object({
  CODEX_BRIDGE_HOST: z.string().default("127.0.0.1"),
  CODEX_BRIDGE_PORT: z.coerce.number().int().positive().default(8787),
  CODEX_BRIDGE_RUNTIME: RuntimeSchema.default("app-server"),
  CODEX_BRIDGE_WORKSPACE_ALLOWLIST: z.string().optional(),
  CODEX_BRIDGE_WORKSPACE_ALLOWLIST_FILE: z.string().optional(),
  CODEX_BRIDGE_SKIP_GIT_REPO_CHECK: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  CODEX_BRIDGE_DEFAULT_MODEL: z.string().optional(),
  CODEX_BRIDGE_HEARTBEAT_MS: z.coerce.number().int().positive().default(15000)
});

export type BridgeRuntime = z.infer<typeof RuntimeSchema>;

export type BridgeConfig = {
  host: string;
  port: number;
  runtime: BridgeRuntime;
  workspaceAllowlist: string[];
  workspaceAllowlistFile: string;
  defaultWorkspace: string;
  defaultSkipGitRepoCheck: boolean;
  defaultModel: string | null;
  heartbeatMs: number;
  version: string;
};

export function getBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const parsed = EnvSchema.parse(env);
  const defaultWorkspace = resolveDefaultWorkspace();
  const workspaceAllowlistFile = path.resolve(
    parsed.CODEX_BRIDGE_WORKSPACE_ALLOWLIST_FILE ??
      path.join(defaultWorkspace, "config", "workspaces.allowlist")
  );
  const workspaceAllowlist = parseWorkspaceAllowlist(
    parsed.CODEX_BRIDGE_WORKSPACE_ALLOWLIST,
    defaultWorkspace
  );

  return {
    host: parsed.CODEX_BRIDGE_HOST,
    port: parsed.CODEX_BRIDGE_PORT,
    runtime: parsed.CODEX_BRIDGE_RUNTIME,
    workspaceAllowlist,
    workspaceAllowlistFile,
    defaultWorkspace,
    defaultSkipGitRepoCheck: parsed.CODEX_BRIDGE_SKIP_GIT_REPO_CHECK,
    defaultModel: parsed.CODEX_BRIDGE_DEFAULT_MODEL?.trim() || null,
    heartbeatMs: parsed.CODEX_BRIDGE_HEARTBEAT_MS,
    version: "0.1.0"
  };
}

function resolveDefaultWorkspace() {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "backend") {
    return path.resolve(cwd, "..");
  }
  return cwd;
}

function parseWorkspaceAllowlist(value: string | undefined, fallback: string) {
  const rawRoots = value
    ? value
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [fallback];

  return rawRoots.map((entry) => path.resolve(entry));
}
