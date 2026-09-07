import {
  parseCodexMobileBuildConfig,
  resolveDefaultBridgeUrl
} from "../src/config/mobileBuildConfig";

describe("mobile build config", () => {
  it("defaults to the http gateway and the loopback bridge", () => {
    const config = parseCodexMobileBuildConfig({});

    expect(config.gateway).toBe("http");
    expect(config.apiBaseUrl).toBe("http://127.0.0.1:8787");
    expect(config.bridgeUrlOverride).toBeNull();
  });

  it("falls back to http for unknown gateway values", () => {
    expect(parseCodexMobileBuildConfig({ gateway: "ssh_tunnel" }).gateway).toBe("http");
    expect(parseCodexMobileBuildConfig({ gateway: "" }).gateway).toBe("http");
    expect(parseCodexMobileBuildConfig({ gateway: "mock" }).gateway).toBe("mock");
  });

  it("uses the configured bridge URL", () => {
    const config = parseCodexMobileBuildConfig({
      gateway: "http",
      apiBaseUrl: "http://10.77.77.1:8787"
    });

    expect(resolveDefaultBridgeUrl(config)).toBe("http://10.77.77.1:8787");
  });

  it("lets an explicit override win over the build default", () => {
    const config = parseCodexMobileBuildConfig({
      apiBaseUrl: "http://10.77.77.1:8787",
      bridgeUrlOverride: "http://127.0.0.1:8787"
    });

    expect(resolveDefaultBridgeUrl(config)).toBe("http://127.0.0.1:8787");
  });

  it("ignores blank values", () => {
    const config = parseCodexMobileBuildConfig({
      apiBaseUrl: "   ",
      bridgeUrlOverride: ""
    });

    expect(config.apiBaseUrl).toBe("http://127.0.0.1:8787");
    expect(config.bridgeUrlOverride).toBeNull();
  });
});
