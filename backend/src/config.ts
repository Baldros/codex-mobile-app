import path from "node:path";
import os from "node:os";
import { z } from "zod";

const RuntimeSchema = z.enum(["app-server", "sdk"]);

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
  CODEX_BRIDGE_HEARTBEAT_MS: z.coerce.number().int().positive().default(15000),
  CODEX_BRIDGE_RUN_BUFFER_EVENTS: z.coerce.number().int().positive().default(5000),
  CODEX_BRIDGE_RUN_RETENTION_MS: z.coerce.number().int().nonnegative().default(300000),
  CODEX_BRIDGE_UPLOAD_DIR: z.string().optional(),
  CODEX_BRIDGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  CODEX_BRIDGE_UPLOAD_TOTAL_MAX_BYTES: z.coerce.number().int().positive().default(512 * 1024 * 1024),
  CODEX_BRIDGE_UPLOADS_ENABLED: z.enum(["true", "false"]).optional()
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
  runBufferEvents: number;
  runRetentionMs: number;
  uploadDir: string;
  uploadMaxBytes: number;
  uploadTotalMaxBytes: number;
  uploadsEnabled: boolean;
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
    runBufferEvents: parsed.CODEX_BRIDGE_RUN_BUFFER_EVENTS,
    runRetentionMs: parsed.CODEX_BRIDGE_RUN_RETENTION_MS,
    uploadDir: path.resolve(parsed.CODEX_BRIDGE_UPLOAD_DIR ?? path.join(os.homedir(), ".codex-mobile", "uploads")),
    uploadMaxBytes: parsed.CODEX_BRIDGE_UPLOAD_MAX_BYTES,
    uploadTotalMaxBytes: parsed.CODEX_BRIDGE_UPLOAD_TOTAL_MAX_BYTES,
    uploadsEnabled: parsed.CODEX_BRIDGE_HOST !== "0.0.0.0" &&
      parsed.CODEX_BRIDGE_HOST !== "::" &&
      (parsed.CODEX_BRIDGE_UPLOADS_ENABLED === "true" ||
        (parsed.CODEX_BRIDGE_UPLOADS_ENABLED !== "false" &&
          ["127.0.0.1", "::1", "localhost"].includes(parsed.CODEX_BRIDGE_HOST))),
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
