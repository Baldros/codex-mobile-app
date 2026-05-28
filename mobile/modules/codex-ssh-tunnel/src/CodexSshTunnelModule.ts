import { NativeModule, requireNativeModule } from "expo";

import type { NativeTunnelStartOptions, NativeTunnelStatus } from "./CodexSshTunnel.types";

declare class CodexSshTunnelModule extends NativeModule<{}> {
  startTunnelAsync(options: NativeTunnelStartOptions): Promise<NativeTunnelStatus>;
  stopTunnelAsync(): Promise<void>;
  getStatusAsync(): Promise<NativeTunnelStatus>;
}

export default requireNativeModule<CodexSshTunnelModule>("CodexSshTunnel");
