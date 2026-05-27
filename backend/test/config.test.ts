import path from "node:path";

import { describe, expect, it } from "vitest";

import { getBridgeConfig } from "../src/config.js";
import { assertWorkspaceAllowed, isPathInside } from "../src/pathPolicy.js";

describe("bridge config", () => {
  it("parses env values", () => {
    const root = process.cwd();
    const config = getBridgeConfig({
      CODEX_BRIDGE_HOST: "127.0.0.1",
      CODEX_BRIDGE_PORT: "19000",
      CODEX_BRIDGE_RUNTIME: "mock",
      CODEX_BRIDGE_WORKSPACE_ALLOWLIST: root,
      CODEX_BRIDGE_SKIP_GIT_REPO_CHECK: "true",
      CODEX_BRIDGE_DEFAULT_MODEL: "gpt-5.4",
      CODEX_BRIDGE_HEARTBEAT_MS: "1000"
    });

    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 19000,
      runtime: "mock",
      defaultSkipGitRepoCheck: true,
      defaultModel: "gpt-5.4",
      heartbeatMs: 1000
    });
    expect(config.workspaceAllowlist).toEqual([path.resolve(root)]);
  });
});

describe("workspace policy", () => {
  it("accepts the allowlisted root and descendants", () => {
    const root = process.cwd();

    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(path.join(root, "src"), root)).toBe(true);
  });

  it("rejects sibling paths", () => {
    const root = path.join(process.cwd(), "allowed");
    const sibling = path.join(process.cwd(), "allowed-other");

    expect(isPathInside(sibling, root)).toBe(false);
    expect(() => assertWorkspaceAllowed(sibling, [root])).toThrow("Workspace is outside");
  });
});
