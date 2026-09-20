const base = require("./app.json");

function withDefault(name, fallback) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
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
        gateway: withDefault("CODEX_MOBILE_GATEWAY", "http"),
        apiBaseUrl: withDefault("CODEX_MOBILE_API_BASE_URL", "http://127.0.0.1:8787")
      }
    }
  };
};
