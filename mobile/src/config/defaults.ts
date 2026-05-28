import type { BridgePreferences } from "../domain/bridge";

import { resolveDefaultBridgeUrl } from "./mobileBuildConfig";

export const DEFAULT_BRIDGE_URL = resolveDefaultBridgeUrl();

export const DEFAULT_PREFERENCES: BridgePreferences = {
  baseUrl: DEFAULT_BRIDGE_URL,
  selectedWorkspacePath: null,
  selectedThreadId: null,
  selectedModelId: null,
  reasoningEffort: "medium",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  serviceTier: null,
  networkAccessEnabled: false
};
