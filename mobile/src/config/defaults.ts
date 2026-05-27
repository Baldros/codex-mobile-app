import { Platform } from "react-native";

import type { BridgePreferences } from "../domain/bridge";

const envBridgeUrl = process.env.EXPO_PUBLIC_BRIDGE_URL;

export const DEFAULT_BRIDGE_URL =
  envBridgeUrl && envBridgeUrl.trim().length > 0
    ? envBridgeUrl.trim()
    : Platform.OS === "web"
      ? "http://127.0.0.1:8787"
      : "http://127.0.0.1:18080";

export const DEFAULT_PREFERENCES: BridgePreferences = {
  baseUrl: DEFAULT_BRIDGE_URL,
  selectedWorkspacePath: null,
  selectedModelId: null,
  reasoningEffort: "medium",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  serviceTier: null,
  networkAccessEnabled: false
};
