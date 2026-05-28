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

  capabilities() {
    const fileBacked = fs.existsSync(this.config.workspaceAllowlistFile);
    return {
      remove: fileBacked,
      restore: fileBacked
    };
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

  removeFromFileAllowlist(candidate: string) {
    if (!fs.existsSync(this.config.workspaceAllowlistFile)) {
      return {
        supported: false,
        removed: false,
        path: path.resolve(candidate),
        reason: "Workspace removal is only supported for file-based allowlists."
      };
    }

    const resolvedCandidate = path.resolve(candidate);
    const content = fs.readFileSync(this.config.workspaceAllowlistFile, "utf8");
    const lines = splitPreservingLines(content);
    let removed = false;
    const nextLines = lines.filter((line) => {
      const parsed = parseAllowlistLine(line.text);
      if (!parsed) {
        return true;
      }

      const resolved = path.resolve(this.config.defaultWorkspace, parsed);
      if (samePath(resolved, resolvedCandidate)) {
        removed = true;
        return false;
      }
      return true;
    });

    if (removed) {
      fs.writeFileSync(
        this.config.workspaceAllowlistFile,
        nextLines.map((line) => line.raw).join(""),
        "utf8"
      );
    }

    return {
      supported: true,
      removed,
      path: resolvedCandidate
    };
  }

  restoreToFileAllowlist(candidate: string) {
    if (!fs.existsSync(this.config.workspaceAllowlistFile)) {
      return {
        supported: false,
        restored: false,
        path: path.resolve(candidate),
        reason: "Workspace restore is only supported for file-based allowlists."
      };
    }

    const resolvedCandidate = path.resolve(candidate);
    const content = fs.readFileSync(this.config.workspaceAllowlistFile, "utf8");
    const entries = parseAllowlistFile(content).map((entry) =>
      path.resolve(this.config.defaultWorkspace, entry)
    );

    if (entries.some((entry) => samePath(entry, resolvedCandidate))) {
      return {
        supported: true,
        restored: false,
        path: resolvedCandidate
      };
    }

    const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(this.config.workspaceAllowlistFile, `${prefix}${resolvedCandidate}\n`, "utf8");

    return {
      supported: true,
      restored: true,
      path: resolvedCandidate
    };
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
    .map(parseAllowlistLine)
    .filter((line): line is string => line !== null);
}

function parseAllowlistLine(line: string) {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }
  return trimmed;
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

function samePath(left: string, right: string) {
  return normalizePath(path.resolve(left)) === normalizePath(path.resolve(right));
}

function splitPreservingLines(content: string) {
  const matches = content.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  return matches
    .filter((line) => line.length > 0)
    .map((raw) => ({
      raw,
      text: raw.replace(/[\r\n]+$/, "")
    }));
}
