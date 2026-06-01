import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemService } from "../src/filesystem/FileSystemService.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("FileSystemService", () => {
  it("lists local roots", () => {
    const service = new FileSystemService();
    const roots = service.listRoots();

    expect(roots.data.length).toBeGreaterThan(0);
    expect(roots.data[0]).toMatchObject({
      name: expect.any(String),
      path: expect.any(String),
      is_git_repo: expect.any(Boolean)
    });
  });

  it("lists only directory children and reports git repositories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mobile-fs-"));
    tempDirs.push(root);
    const repo = path.join(root, "repo");
    const other = path.join(root, "other");
    fs.mkdirSync(repo);
    fs.mkdirSync(path.join(repo, ".git"));
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(root, "file.txt"), "not a directory");

    const service = new FileSystemService();
    const result = service.listChildren(root);

    expect(result).toMatchObject({
      path: root,
      parent: path.dirname(root),
      truncated: false
    });
    expect(result.children.map((child) => child.name)).toEqual(["other", "repo"]);
    expect(result.children.find((child) => child.name === "repo")).toMatchObject({
      path: repo,
      is_git_repo: true
    });
  });

  it("rejects missing directories", () => {
    const service = new FileSystemService();
    expect(() => service.listChildren(path.join(os.tmpdir(), "missing-codex-mobile-dir"))).toThrow(
      "Directory does not exist"
    );
  });
});
