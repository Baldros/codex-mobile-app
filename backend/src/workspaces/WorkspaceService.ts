import fs from "node:fs";
import path from "node:path";

import type { BridgeConfig } from "../config.js";
import { AppError } from "../errors.js";
import { isPathInside } from "../pathPolicy.js";

export type WorkspaceEntry = {
  path: string;
  name: string;
  exists: boolean;
  is_git_repo: boolean;
  source: "file" | "env" | "fallback";
};

export class WorkspaceService {
  constructor(private readonly config: BridgeConfig) {}

  listWorkspaces(): WorkspaceEntry[] {
    return this.loadEntries();
  }

  getAllowedRoots() {
    return this.loadEntries()
      .filter((entry) => entry.exists)
      .map((entry) => entry.path);
  }

  assertAllowed(candidate: string) {
    const resolvedCandidate = path.resolve(candidate);
    const allowedRoots = this.getAllowedRoots();
    const allowed = allowedRoots.some((root) => isPathInside(resolvedCandidate, root));

    if (!allowed) {
      throw new AppError(
        403,
        "workspace_not_allowed",
        `Workspace is outside the configured allowlist: ${resolvedCandidate}`
      );
    }

    return resolvedCandidate;
  }

  private loadEntries(): WorkspaceEntry[] {
    const sources = this.loadRawSources();
    const seen = new Set<string>();
    const entries: WorkspaceEntry[] = [];

    for (const source of sources) {
      const resolved = path.resolve(this.config.defaultWorkspace, source.rawPath);
      const normalized = normalizePath(resolved);
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);

      entries.push({
        path: resolved,
        name: path.basename(resolved) || resolved,
        exists: isDirectory(resolved),
        is_git_repo: isGitRepository(resolved),
        source: source.source
      });
    }

    return entries;
  }

  private loadRawSources() {
    if (fs.existsSync(this.config.workspaceAllowlistFile)) {
      const content = fs.readFileSync(this.config.workspaceAllowlistFile, "utf8");
      const paths = parseAllowlistFile(content);
      return paths.map((rawPath) => ({ rawPath, source: "file" as const }));
    }

    if (this.config.workspaceAllowlist.length > 0) {
      return this.config.workspaceAllowlist.map((rawPath) => ({
        rawPath,
        source: "env" as const
      }));
    }

    return [{ rawPath: this.config.defaultWorkspace, source: "fallback" as const }];
  }
}

export function parseAllowlistFile(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function isDirectory(candidate: string) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function isGitRepository(candidate: string) {
  return fs.existsSync(path.join(candidate, ".git"));
}

function normalizePath(candidate: string) {
  return process.platform === "win32" ? candidate.toLowerCase() : candidate;
}
