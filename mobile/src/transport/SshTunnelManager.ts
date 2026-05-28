import { Platform } from "react-native";

import type {
  CodexMobileBuildConfig,
  SshEndpointCandidate
} from "../config/mobileBuildConfig";
import { validateSshTunnelBuildConfig } from "../config/mobileBuildConfig";
import type {
  NativeTunnelStartOptions,
  NativeTunnelStatus
} from "../../modules/codex-ssh-tunnel/src/CodexSshTunnel.types";

export type TunnelState = "disconnected" | "connecting" | "ready" | "reconnecting" | "failed";

export type TunnelStatusSnapshot = {
  state: TunnelState;
  message: string;
  connected: boolean;
  activeEndpoint: string | null;
  lastHealthCheckMs: number | null;
  lastError: string | null;
};

type Listener = (snapshot: TunnelStatusSnapshot) => void;

const INITIAL_STATUS: TunnelStatusSnapshot = {
  state: "disconnected",
  message: "Tunnel stopped",
  connected: false,
  activeEndpoint: null,
  lastHealthCheckMs: null,
  lastError: null
};

export class SshTunnelManager {
  private status: TunnelStatusSnapshot = INITIAL_STATUS;
  private readonly listeners = new Set<Listener>();
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly config: CodexMobileBuildConfig) {}

  getSnapshot() {
    return this.status;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async ensureReady() {
    if (this.config.gateway !== "ssh_tunnel" || Platform.OS === "web") {
      return;
    }

    const configIssue = validateSshTunnelBuildConfig(this.config);
    if (configIssue) {
      this.setStatus({
        state: "failed",
        message: configIssue,
        connected: false,
        lastError: configIssue
      });
      throw new Error(configIssue);
    }

    if (this.status.state === "ready") {
      try {
        const elapsed = await this.checkHealth();
        this.setStatus({
          state: "ready",
          message: "Tunnel ready",
          connected: true,
          lastHealthCheckMs: elapsed,
          lastError: null
        });
        return;
      } catch {
        this.setStatus({
          state: "reconnecting",
          message: "Reconnecting tunnel",
          connected: false
        });
      }
    }

    if (!this.readyPromise) {
      this.readyPromise = this.connectWithFailover().finally(() => {
        this.readyPromise = null;
      });
    }

    return this.readyPromise;
  }

  async stop() {
    const nativeModule = await loadNativeModule();
    await nativeModule.stopTunnelAsync();
    this.setStatus(INITIAL_STATUS);
  }

  private async connectWithFailover() {
    let lastError: unknown = null;

    for (const endpoint of this.config.sshTunnel.endpointCandidates) {
      try {
        this.setStatus({
          state: this.status.state === "reconnecting" ? "reconnecting" : "connecting",
          message: `Connecting to ${endpoint.displayValue}`,
          connected: false,
          activeEndpoint: endpoint.displayValue,
          lastError: null
        });

        const nativeStatus = await this.startNativeTunnel(endpoint);
        const elapsed = await this.checkHealth();
        this.setStatus({
          state: "ready",
          message: "Tunnel ready",
          connected: nativeStatus.connected,
          activeEndpoint: endpoint.displayValue,
          lastHealthCheckMs: elapsed,
          lastError: null
        });
        return;
      } catch (error) {
        lastError = error;
        await this.stopNativeTunnel();
      }
    }

    const message = errorMessage(lastError) ?? "Failed to connect SSH tunnel.";
    this.setStatus({
      state: "failed",
      message,
      connected: false,
      lastError: message
    });
    throw new Error(message);
  }

  private async startNativeTunnel(endpoint: SshEndpointCandidate): Promise<NativeTunnelStatus> {
    const nativeModule = await loadNativeModule();
    const options: NativeTunnelStartOptions = {
      sshHost: endpoint.host,
      sshPort: endpoint.port,
      username: this.config.sshTunnel.username,
      localBindHost: this.config.sshTunnel.localBindHost,
      localBindPort: this.config.sshTunnel.localBindPort,
      remoteApiHost: this.config.sshTunnel.remoteApiHost,
      remoteApiPort: this.config.sshTunnel.remoteApiPort,
      connectTimeoutMs: this.config.sshTunnel.connectTimeoutMs,
      strictHostKeyChecking: false
    };

    if (this.config.sshTunnel.password) {
      options.password = this.config.sshTunnel.password;
    }
    if (this.config.sshTunnel.privateKeyPem) {
      options.privateKeyPem = this.config.sshTunnel.privateKeyPem;
    }
    if (this.config.sshTunnel.privateKeyPassphrase) {
      options.privateKeyPassphrase = this.config.sshTunnel.privateKeyPassphrase;
    }

    return nativeModule.startTunnelAsync(options);
  }

  private async stopNativeTunnel() {
    try {
      const nativeModule = await loadNativeModule();
      await nativeModule.stopTunnelAsync();
    } catch {
      // Best effort cleanup while trying failover endpoints.
    }
  }

  private async checkHealth() {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.sshTunnel.healthTimeoutMs);

    try {
      const response = await fetch(`${this.config.sshTunnel.localUrl.replace(/\/+$/, "")}/health`, {
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Bridge health failed with ${response.status}.`);
      }
      return Date.now() - started;
    } finally {
      clearTimeout(timeout);
    }
  }

  private setStatus(patch: Partial<TunnelStatusSnapshot>) {
    this.status = {
      ...this.status,
      ...patch
    };
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }
}

async function loadNativeModule() {
  const module = await import("../../modules/codex-ssh-tunnel/src/CodexSshTunnelModule");
  return module.default;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : error ? String(error) : null;
}
