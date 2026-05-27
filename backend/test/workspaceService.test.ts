import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { BridgeConfig } from "../src/config.js";
import { parseAllowlistFile, WorkspaceService } from "../src/workspaces/WorkspaceService.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("WorkspaceService", () => {
  it("parses one workspace path per line and ignores comments", () => {
    expect(parseAllowlistFile("# comment\nE:\\repo\n\nD:\\other\n")).toEqual([
      "E:\\repo",
      "D:\\other"
    ]);
  });

  it("loads workspaces from the allowlist file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mobile-workspaces-"));
    tempDirs.push(root);
    const repo = path.join(root, "repo");
    fs.mkdirSync(repo);
    fs.mkdirSync(path.join(repo, ".git"));

    const allowlistFile = path.join(root, "workspaces.allowlist");
    fs.writeFileSync(allowlistFile, `${repo}\n${path.join(root, "missing")}\n`);

    const service = new WorkspaceService(testConfig(root, allowlistFile));
    const workspaces = service.listWorkspaces();

    expect(workspaces).toHaveLength(2);
    expect(workspaces[0]).toMatchObject({
      path: repo,
      exists: true,
      is_git_repo: true,
      source: "file"
    });
    expect(workspaces[1]).toMatchObject({
      exists: false,
      source: "file"
    });
    expect(service.assertAllowed(path.join(repo, "src"))).toBe(path.join(repo, "src"));
  });
});

function testConfig(defaultWorkspace: string, workspaceAllowlistFile: string): BridgeConfig {
  return {
    host: "127.0.0.1",
    port: 8787,
    runtime: "mock",
    workspaceAllowlist: [],
    workspaceAllowlistFile,
    defaultWorkspace,
    defaultSkipGitRepoCheck: true,
    defaultModel: null,
    heartbeatMs: 15000,
    version: "test"
  };
}
