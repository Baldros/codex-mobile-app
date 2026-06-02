# Codex Mobile App

Internal mobile companion for operating a local Codex CLI/harness session through SSH tunnel based network security.

## Technical Direction

The mobile app does not talk directly to the OpenAI API and does not import the Codex SDK in the client. The target architecture is:

```text
Mobile app
  -> http://127.0.0.1:18080
  -> SSH local port forward
  -> desktop 127.0.0.1:8787
  -> Codex Bridge Node/TypeScript
  -> codex app-server, Codex SDK, or codex exec
  -> local Codex CLI/harness
```

This direction follows the current official Codex documentation:

- Codex SDK: https://developers.openai.com/codex/sdk
- Codex app-server: https://developers.openai.com/codex/app-server
- Codex CLI reference: https://developers.openai.com/codex/cli/reference
- Remote app-server notes: https://developers.openai.com/codex/cli/features#connect-the-tui-to-a-remote-app-server

## Conventions

- Local bridge: `127.0.0.1:8787`
- Local mobile port: `127.0.0.1:18080`
- Remote port forwarded by SSH: `127.0.0.1:8787`
- Default mobile transport: `ssh_tunnel`
- Bridge stack: Node.js + TypeScript
- App stack: Expo + React Native + TypeScript

## Documentation

- `docs/ARCHITECTURE.md`: target architecture and decisions from Atlas Desktop Agent.
- `docs/API_CONTRACT.md`: HTTP/SSE contract between mobile and bridge.
- `docs/SSH_TUNNEL_RUNBOOK.md`: SSH tunnel operation on local networks and 5G.
- `docs/MOBILE_ANDROID_BUILD_PLAYBOOK.md`: internal Android build and `CODEX_MOBILE_*` variables.
- `docs/SECURITY_DECISIONS.md`: decision on embedded SSH password/key.
- `docs/IMPLEMENTATION_PLAN.md`: incremental implementation plan.
- `build-guide/README.md`: interactive HTML build guide for the Android APK.

## Backend

The local backend is in `backend/`. It exposes a loopback HTTP/SSE API, normalizes the contract for mobile, and encapsulates the real Codex runtime.

```powershell
cd backend
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run smoke:app-server
```

Supported runtimes:

- `app-server`: recommended for native history, settings, and human-in-the-loop.
- `sdk`: simple adapter through `@openai/codex-sdk`.
- `mock`: deterministic runtime for tests and development without calling Codex.

Example running in mock mode:

```powershell
$env:CODEX_BRIDGE_RUNTIME="mock"
npm run dev
```

## Mobile

The mobile app is in `mobile/`. The current MVP includes the operational shell, workspace/model/conversation selection, SSE chat, activity events, pending approvals, cancellation, and a basic settings screen.

```powershell
cd mobile
npm install
npx expo start
```

Use `npx expo start --web` or `npm run web` for a quick browser preview during development.

Default URLs:

- Local web/dev: `http://127.0.0.1:8787`
- Physical mobile device: `http://127.0.0.1:18080`

To override the bridge URL:

```powershell
$env:EXPO_PUBLIC_BRIDGE_URL="http://127.0.0.1:8787"
npx expo start
```

## Workspaces

Allowed workspaces live at:

```text
config/workspaces.allowlist
```

One path per line. The local file is ignored by Git; `config/workspaces.allowlist.example` is the template. The app can also add a new path to this allowlist through the bridge when the directory exists.

## API

The bridge exposes the HTTP/SSE API on loopback. The complete canonical endpoint reference is in `backend/README.md` (health/capabilities, threads, runs with SSE streaming and reattach, workspaces, settings, apps/skills, MCP, approvals, and SSH status). Start with `GET /v1/capabilities` to discover what the active runtime supports.

## Build Guide

The interactive build guide is in `build-guide/`. Open `build-guide/index.html` directly in a browser to walk through prerequisites, SSH setup, release APK build, installation, security guidance, and troubleshooting.

## Current State

The technical foundation, local bridge, and mobile app are implemented and operational. The app covers workspace/model/conversation selection, streaming chat with Markdown rendering, activity and tool timeline, human-in-the-loop approvals, cancellation, structured mentions (`$app`/`$skill`/`$mcp`), MCP resource navigation, account limits and execution mode presets, plus the SSH tunnel manager. The main next steps are hardening app failure states and adding pairing/operational security for internal use on local networks or 5G.
