import Constants from "expo-constants";

export type GatewayMode = "mock" | "http";

export type CodexMobileBuildConfig = {
  gateway: GatewayMode;
  bridgeUrlOverride: string | null;
  apiBaseUrl: string;
};

export type RawCodexMobileBuildConfig = Record<string, unknown>;

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8787";

export function getCodexMobileBuildConfig() {
  return parseCodexMobileBuildConfig(readRawRuntimeConfig());
}

export function resolveDefaultBridgeUrl(
  config: CodexMobileBuildConfig = getCodexMobileBuildConfig()
) {
  return config.bridgeUrlOverride ?? config.apiBaseUrl;
}

export function parseCodexMobileBuildConfig(
  raw: RawCodexMobileBuildConfig
): CodexMobileBuildConfig {
  return {
    gateway: parseGatewayMode(stringValue(raw.gateway)),
    bridgeUrlOverride: stringValue(raw.bridgeUrlOverride),
    apiBaseUrl: stringValue(raw.apiBaseUrl) ?? DEFAULT_BRIDGE_URL
  };
}

function readRawRuntimeConfig(): RawCodexMobileBuildConfig {
  const extra = Constants.expoConfig?.extra;
  const codexMobile =
    extra && typeof extra === "object" && "codexMobile" in extra
      ? (extra.codexMobile as RawCodexMobileBuildConfig)
      : {};

  return {
    ...codexMobile,
    bridgeUrlOverride: process.env.EXPO_PUBLIC_BRIDGE_URL
  };
}

function parseGatewayMode(value: string | null): GatewayMode {
  return value === "mock" ? "mock" : "http";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
