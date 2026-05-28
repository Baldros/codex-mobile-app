import Constants from "expo-constants";
import { Platform } from "react-native";

export type GatewayMode = "mock" | "http" | "ssh_tunnel";
export type SshAuthMode = "password" | "private_key";

export type SshEndpointCandidate = {
  host: string;
  port: number;
  displayValue: string;
};

export type SshTunnelBuildConfig = {
  localUrl: string;
  localBindHost: string;
  localBindPort: number;
  endpointCandidates: SshEndpointCandidate[];
  username: string;
  authMode: SshAuthMode | null;
  password: string;
  privateKeyPem: string;
  privateKeyPassphrase: string;
  remoteApiHost: string;
  remoteApiPort: number;
  connectTimeoutMs: number;
  healthTimeoutMs: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  reconnectMaxAttempts: number;
  autoReconnect: boolean;
  allowEmbeddedSshSecret: boolean;
};

export type CodexMobileBuildConfig = {
  gateway: GatewayMode;
  bridgeUrlOverride: string | null;
  apiBaseUrl: string;
  sshTunnel: SshTunnelBuildConfig;
};

export type RawCodexMobileBuildConfig = Record<string, unknown>;

const DEFAULT_DIRECT_BRIDGE_URL = "http://127.0.0.1:8787";
const DEFAULT_TUNNEL_LOCAL_URL = "http://127.0.0.1:18080";

export function getCodexMobileBuildConfig() {
  return parseCodexMobileBuildConfig(readRawRuntimeConfig());
}

export function resolveDefaultBridgeUrl(
  platformOS: typeof Platform.OS = Platform.OS,
  config: CodexMobileBuildConfig = getCodexMobileBuildConfig()
) {
  if (config.bridgeUrlOverride) {
    return config.bridgeUrlOverride;
  }

  if (platformOS === "web") {
    return config.apiBaseUrl;
  }

  return config.gateway === "ssh_tunnel" ? config.sshTunnel.localUrl : config.apiBaseUrl;
}

export function validateSshTunnelBuildConfig(config: CodexMobileBuildConfig) {
  if (config.gateway !== "ssh_tunnel") {
    return null;
  }

  if (config.sshTunnel.endpointCandidates.length === 0) {
    return "CODEX_MOBILE_SSH_REMOTE_HOSTS nao configurado.";
  }

  if (!config.sshTunnel.username) {
    return "CODEX_MOBILE_SSH_USERNAME nao configurado.";
  }

  if (!config.sshTunnel.password && !config.sshTunnel.privateKeyPem) {
    return "Configure CODEX_MOBILE_SSH_PASSWORD ou CODEX_MOBILE_SSH_PRIVATE_KEY_PEM.";
  }

  if (
    (config.sshTunnel.password || config.sshTunnel.privateKeyPem) &&
    !config.sshTunnel.allowEmbeddedSshSecret
  ) {
    return "Defina CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET=true para build interno com segredo SSH.";
  }

  return null;
}

export function parseCodexMobileBuildConfig(
  raw: RawCodexMobileBuildConfig
): CodexMobileBuildConfig {
  const tunnelLocalUrl = stringValue(raw.sshTunnelLocalUrl) ?? DEFAULT_TUNNEL_LOCAL_URL;
  const localUri = parseUrl(tunnelLocalUrl, DEFAULT_TUNNEL_LOCAL_URL);
  const authMode = parseAuthMode(stringValue(raw.sshAuthMode));
  const password = stringValue(raw.sshPassword) ?? "";
  const privateKeyPem = stringValue(raw.sshPrivateKeyPem) ?? "";

  return {
    gateway: parseGatewayMode(stringValue(raw.gateway)),
    bridgeUrlOverride: stringValue(raw.bridgeUrlOverride),
    apiBaseUrl: stringValue(raw.apiBaseUrl) ?? DEFAULT_DIRECT_BRIDGE_URL,
    sshTunnel: {
      localUrl: tunnelLocalUrl,
      localBindHost: normalizeLoopbackHost(localUri.hostname),
      localBindPort: localUri.port ? parseIntValue(localUri.port, 18080) : 18080,
      endpointCandidates: parseEndpointCandidates(stringValue(raw.sshRemoteHosts) ?? ""),
      username: stringValue(raw.sshUsername) ?? "",
      authMode: authMode ?? inferAuthMode(password, privateKeyPem),
      password,
      privateKeyPem,
      privateKeyPassphrase: stringValue(raw.sshPrivateKeyPassphrase) ?? "",
      remoteApiHost: stringValue(raw.sshRemoteApiHost) ?? "127.0.0.1",
      remoteApiPort: parseIntValue(stringValue(raw.sshRemoteApiPort), 8787),
      connectTimeoutMs: parseIntValue(stringValue(raw.sshConnectTimeoutMs), 9000),
      healthTimeoutMs: parseIntValue(stringValue(raw.sshHealthTimeoutMs), 4500),
      reconnectBaseMs: parseIntValue(stringValue(raw.sshReconnectBaseMs), 1200),
      reconnectMaxMs: parseIntValue(stringValue(raw.sshReconnectMaxMs), 15000),
      reconnectMaxAttempts: parseIntValue(stringValue(raw.sshReconnectMaxAttempts), 6),
      autoReconnect: parseBoolValue(stringValue(raw.sshAutoReconnect), true),
      allowEmbeddedSshSecret: parseBoolValue(stringValue(raw.allowEmbeddedSshSecret), false)
    }
  };
}

export function parseEndpointCandidates(rawValue: string) {
  return rawValue
    .split(",")
    .map((item) => parseEndpoint(item.trim()))
    .filter((item): item is SshEndpointCandidate => item !== null);
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

function parseEndpoint(input: string): SshEndpointCandidate | null {
  if (!input) {
    return null;
  }

  if (input.startsWith("[")) {
    const closingIndex = input.indexOf("]");
    if (closingIndex < 0) {
      return null;
    }

    const host = input.slice(1, closingIndex).trim();
    const portSuffix = input.slice(closingIndex + 1).trim();
    if (!host) {
      return null;
    }

    if (!portSuffix) {
      return endpoint(host, 22);
    }

    if (!portSuffix.startsWith(":")) {
      return null;
    }

    const port = parsePort(portSuffix.slice(1));
    return port ? endpoint(host, port) : null;
  }

  const colonCount = input.split(":").length - 1;
  if (colonCount === 0) {
    return endpoint(input, 22);
  }

  if (colonCount === 1) {
    const separatorIndex = input.lastIndexOf(":");
    const host = input.slice(0, separatorIndex).trim();
    const port = parsePort(input.slice(separatorIndex + 1));
    return host && port ? endpoint(host, port) : null;
  }

  return endpoint(input, 22);
}

function endpoint(host: string, port: number): SshEndpointCandidate {
  const displayHost = host.includes(":") ? `[${host}]` : host;
  return {
    host,
    port,
    displayValue: `${displayHost}:${port}`
  };
}

function parseGatewayMode(value: string | null): GatewayMode {
  if (value === "mock" || value === "http" || value === "ssh_tunnel") {
    return value;
  }
  return "ssh_tunnel";
}

function parseAuthMode(value: string | null): SshAuthMode | null {
  if (value === "password" || value === "private_key") {
    return value;
  }
  return null;
}

function inferAuthMode(password: string, privateKeyPem: string): SshAuthMode | null {
  if (privateKeyPem) {
    return "private_key";
  }
  if (password) {
    return "password";
  }
  return null;
}

function parseUrl(value: string, fallback: string) {
  try {
    return new URL(value);
  } catch {
    return new URL(fallback);
  }
}

function normalizeLoopbackHost(host: string) {
  const value = host.trim().toLowerCase();
  if (!value || value === "localhost" || value === "127.0.0.1") {
    return "127.0.0.1";
  }
  return value;
}

function parsePort(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

function parseIntValue(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolValue(value: string | null, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
