import { NativeModule, registerWebModule } from "expo";

import type { NativeTunnelStartOptions, NativeTunnelStatus } from "./CodexSshTunnel.types";

// CodexSshTunnelModule is not available on the web platform.
class CodexSshTunnelModule extends NativeModule<{}> {
  async startTunnelAsync(_options: NativeTunnelStartOptions): Promise<NativeTunnelStatus> {
    throw new Error("CodexSshTunnel is not available on web.");
  }

  async stopTunnelAsync(): Promise<void> {}

  async getStatusAsync(): Promise<NativeTunnelStatus> {
    return {
      state: "disconnected",
      connected: false,
      localBindHost: "127.0.0.1",
      localBindPort: 18080,
      assignedPort: 18080,
      activeEndpoint: null
    };
  }
}

export default registerWebModule(CodexSshTunnelModule, "CodexSshTunnel");
