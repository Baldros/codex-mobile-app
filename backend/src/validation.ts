import { z } from "zod";

export const CreateThreadBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  workspace: z.string().trim().min(1).optional()
});

export const RunStreamBodySchema = z.object({
  message: z.string().trim().min(1),
  cwd: z.string().trim().min(1).optional(),
  approval_policy: z.enum(["never", "on-request", "on-failure", "untrusted"]).optional(),
  sandbox_mode: z.enum(["read-only", "workspace-write", "danger-full-access"]).optional(),
  model: z.string().trim().min(1).optional(),
  model_reasoning_effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
  service_tier: z.string().trim().min(1).optional(),
  skip_git_repo_check: z.boolean().optional(),
  network_access_enabled: z.boolean().optional(),
  web_search_mode: z.enum(["disabled", "cached", "live"]).optional(),
  additional_directories: z.array(z.string().trim().min(1)).optional()
});

export const CancelRunBodySchema = z.object({
  run_id: z.string().trim().min(1).optional()
});

export const RenameThreadBodySchema = z.object({
  title: z.string().trim().min(1).max(200)
});

export const ArchiveThreadBodySchema = z.object({
  archived: z.boolean().optional().default(true)
});

export const WorkspacePathBodySchema = z.object({
  path: z.string().trim().min(1)
});

export const WriteConfigBodySchema = z.object({
  key_path: z.string().trim().min(1),
  value: z.unknown(),
  merge_strategy: z.enum(["replace", "upsert"]).optional()
});

export const ApprovalResponseBodySchema = z.object({
  decision: z.enum(["accept", "acceptForSession", "decline", "cancel"]),
  payload: z.unknown().optional()
});

export const McpResourceReadBodySchema = z.object({
  server: z.string().trim().min(1),
  uri: z.string().trim().min(1),
  thread_id: z.string().trim().min(1).nullable().optional()
});

export type CreateThreadBody = z.infer<typeof CreateThreadBodySchema>;
export type RunStreamBody = z.infer<typeof RunStreamBodySchema>;
export type CancelRunBody = z.infer<typeof CancelRunBodySchema>;
export type RenameThreadBody = z.infer<typeof RenameThreadBodySchema>;
export type ArchiveThreadBody = z.infer<typeof ArchiveThreadBodySchema>;
export type WorkspacePathBody = z.infer<typeof WorkspacePathBodySchema>;
export type WriteConfigBody = z.infer<typeof WriteConfigBodySchema>;
export type ApprovalResponseBody = z.infer<typeof ApprovalResponseBodySchema>;
export type McpResourceReadBody = z.infer<typeof McpResourceReadBodySchema>;
