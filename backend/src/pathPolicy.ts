import path from "node:path";

import { AppError } from "./errors.js";

export function assertWorkspaceAllowed(candidate: string, allowedRoots: string[]) {
  const resolvedCandidate = path.resolve(candidate);
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

export function isPathInside(candidate: string, root: string) {
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, candidate);

  if (relative === "") {
    return true;
  }

  return !relative.startsWith("..") && !path.isAbsolute(relative);
}
