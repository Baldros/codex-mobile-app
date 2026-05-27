import { createBridgeServer } from "./app.js";
import { getBridgeConfig } from "./config.js";

const config = getBridgeConfig();
const server = createBridgeServer({ config });

server.listen(config.port, config.host, () => {
  const address = `http://${config.host}:${config.port}`;
  console.log(
    JSON.stringify({
      event: "bridge_listening",
      address,
      runtime: config.runtime,
      workspace_allowlist: config.workspaceAllowlist
    })
  );
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
