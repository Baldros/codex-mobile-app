const base = require("./app.json");

function optional(name) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : "";
}

function withDefault(name, fallback) {
  return optional(name) || fallback;
}

module.exports = ({ config }) => {
  const expo = {
    ...config,
    ...base.expo
  };

  return {
    ...expo,
    extra: {
      ...(config.extra ?? {}),
      ...(base.expo.extra ?? {}),
      codexMobile: {
        gateway: withDefault("CODEX_MOBILE_GATEWAY", "ssh_tunnel"),
        apiBaseUrl: withDefault("CODEX_MOBILE_API_BASE_URL", "http://127.0.0.1:8787"),
        sshTunnelLocalUrl: withDefault(
          "CODEX_MOBILE_SSH_TUNNEL_LOCAL_URL",
          "http://127.0.0.1:18080"
        ),
        sshRemoteHosts: optional("CODEX_MOBILE_SSH_REMOTE_HOSTS"),
        sshUsername: optional("CODEX_MOBILE_SSH_USERNAME"),
        sshAuthMode: optional("CODEX_MOBILE_SSH_AUTH_MODE"),
        sshPassword: optional("CODEX_MOBILE_SSH_PASSWORD"),
        sshPrivateKeyPem: optional("CODEX_MOBILE_SSH_PRIVATE_KEY_PEM"),
        sshPrivateKeyPassphrase: optional("CODEX_MOBILE_SSH_PRIVATE_KEY_PASSPHRASE"),
        sshRemoteApiHost: withDefault("CODEX_MOBILE_SSH_REMOTE_API_HOST", "127.0.0.1"),
        sshRemoteApiPort: withDefault("CODEX_MOBILE_SSH_REMOTE_API_PORT", "8787"),
        sshConnectTimeoutMs: withDefault("CODEX_MOBILE_SSH_CONNECT_TIMEOUT_MS", "9000"),
        sshHealthTimeoutMs: withDefault("CODEX_MOBILE_SSH_HEALTH_TIMEOUT_MS", "4500"),
        sshReconnectBaseMs: withDefault("CODEX_MOBILE_SSH_RECONNECT_BASE_MS", "1200"),
        sshReconnectMaxMs: withDefault("CODEX_MOBILE_SSH_RECONNECT_MAX_MS", "15000"),
        sshReconnectMaxAttempts: withDefault("CODEX_MOBILE_SSH_RECONNECT_MAX_ATTEMPTS", "6"),
        sshAutoReconnect: withDefault("CODEX_MOBILE_SSH_AUTO_RECONNECT", "true"),
        allowEmbeddedSshSecret: withDefault(
          "CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET",
          "false"
        )
      }
    }
  };
};
