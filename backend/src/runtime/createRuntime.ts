import type { BridgeConfig } from "../config.js";

import { MockCodexRuntime } from "./MockCodexRuntime.js";
import { SdkCodexRuntime } from "./SdkCodexRuntime.js";
import type { CodexRuntime } from "./types.js";

export function createRuntime(config: BridgeConfig): CodexRuntime {
  if (config.runtime === "mock") {
    return new MockCodexRuntime();
  }

  return new SdkCodexRuntime();
}
