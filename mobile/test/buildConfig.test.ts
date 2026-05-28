import {
  parseCodexMobileBuildConfig,
  parseEndpointCandidates,
  resolveDefaultBridgeUrl,
  validateSshTunnelBuildConfig
} from "../src/config/mobileBuildConfig";

describe("mobile build config", () => {
  it("parses ordered SSH endpoint candidates", () => {
    expect(
      parseEndpointCandidates("[2804:14d:5ca0:46e7::761]:22,186.205.17.7:39223,bare-host")
    ).toEqual([
      {
        host: "2804:14d:5ca0:46e7::761",
        port: 22,
        displayValue: "[2804:14d:5ca0:46e7::761]:22"
      },
      {
        host: "186.205.17.7",
        port: 39223,
        displayValue: "186.205.17.7:39223"
      },
      {
        host: "bare-host",
        port: 22,
        displayValue: "bare-host:22"
      }
    ]);
  });

  it("uses tunnel URL for native ssh_tunnel builds", () => {
    const config = parseCodexMobileBuildConfig({
      gateway: "ssh_tunnel",
      sshTunnelLocalUrl: "http://127.0.0.1:18080",
      apiBaseUrl: "http://127.0.0.1:8787"
    });

    expect(resolveDefaultBridgeUrl("android", config)).toBe("http://127.0.0.1:18080");
    expect(resolveDefaultBridgeUrl("web", config)).toBe("http://127.0.0.1:8787");
  });

  it("validates required SSH tunnel build inputs", () => {
    const missing = parseCodexMobileBuildConfig({
      gateway: "ssh_tunnel"
    });
    expect(validateSshTunnelBuildConfig(missing)).toBe(
      "CODEX_MOBILE_SSH_REMOTE_HOSTS nao configurado."
    );

    const ready = parseCodexMobileBuildConfig({
      gateway: "ssh_tunnel",
      sshRemoteHosts: "186.205.17.7:39223",
      sshUsername: "codex_mobile",
      sshPassword: "secret",
      allowEmbeddedSshSecret: "true"
    });
    expect(validateSshTunnelBuildConfig(ready)).toBeNull();
  });
});
