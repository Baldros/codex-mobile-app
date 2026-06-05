# Codex Mobile App

Mobile companion for using a local Codex setup from an Android device through a
local bridge and an SSH tunnel.

The app is an operations client. It does not talk directly to the OpenAI API and
does not import the Codex SDK in the mobile bundle. The desktop remains the
trust boundary: Codex, OpenAI authentication, workspaces, filesystem access, MCP
servers, apps, skills, and approvals all stay on the machine running the bridge.

## Architecture

```text
Android app
  -> http://127.0.0.1:18080
  -> SSH local port forward
  -> desktop 127.0.0.1:8787
  -> Codex Bridge (Node.js + TypeScript)
  -> codex app-server or @openai/codex-sdk
  -> local Codex CLI/runtime
```

The default runtime is `app-server`, because it supports richer Codex client
behavior: persisted conversations, settings, model/account data, apps, skills,
MCP resources, streamed events, and human-in-the-loop approvals. The SDK runtime
is still available as a simpler adapter, and `mock` is available for tests and
local development without calling Codex.

Official Codex references:

- Codex app-server: https://developers.openai.com/codex/app-server
- Codex SDK: https://developers.openai.com/codex/sdk
- Codex CLI reference: https://developers.openai.com/codex/cli/reference

## Stack

- Backend runtime: Node.js
- Backend language: TypeScript
- Backend package manager/scripts: npm
- Mobile app: Expo + React Native + TypeScript
- Android native tunnel module: Kotlin + Gradle, using JSch
- Transport: HTTP/SSE over loopback, carried through SSH local port forwarding

Conventions:

- Desktop bridge: `127.0.0.1:8787`
- Mobile loopback tunnel: `127.0.0.1:18080`
- Default mobile gateway: `ssh_tunnel`
- Default bridge runtime: `app-server`

## Repository Layout

- `backend/`: local Codex Bridge. Exposes the HTTP/SSE API consumed by mobile and
  wraps the selected Codex runtime.
- `mobile/`: Expo/React Native app plus the native Android SSH tunnel module.
- `build-guide/`: interactive HTML guide for building, installing, securing, and
  troubleshooting the Android APK.
- `docs/`: architecture, API contract, SSH, security, and Android build notes.
- `config/workspaces.allowlist.example`: template for allowed local workspaces.
- `scripts/`: smoke tests and SSH validation helpers.

## Backend

```powershell
cd backend
npm install
npm run dev
```

Useful checks:

```powershell
npm test
npm run typecheck
npm run build
npm run smoke:app-server
```

Runtime selection:

```powershell
$env:CODEX_BRIDGE_RUNTIME = "app-server" # default
npm run dev
```

Supported values are:

- `app-server`: uses `codex app-server` over stdio JSON-RPC. Recommended.
- `sdk`: uses `@openai/codex-sdk`.
- `mock`: deterministic runtime for tests and UI work.

The bridge listens on `127.0.0.1:8787` by default. Confirm it with:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

## Mobile

```powershell
cd mobile
npm install
npx expo start
```

For browser preview during development:

```powershell
npm run web
```

Default URLs:

- Web/dev preview: `http://127.0.0.1:8787`
- Physical Android device with SSH tunnel: `http://127.0.0.1:18080`

The Android tunnel is a local Expo native module under
`mobile/modules/codex-ssh-tunnel/`. Expo Go cannot load this module; use a dev
build or APK for the real Android tunnel flow.

## Android APK Build

The complete build path is documented in the interactive guide:

```text
build-guide/index.html
```

Open it directly in a browser after cloning the repo. No local server is needed.
It covers prerequisites, SSH setup, `CODEX_MOBILE_*` build variables, APK
generation, install, security tradeoffs, and troubleshooting.

The short version is:

1. Start the bridge on the desktop and confirm `/health`.
2. Configure OpenSSH with a dedicated, unprivileged tunnel user.
3. Set `CODEX_MOBILE_*` variables for the app build.
4. Build the native Android project and release APK.
5. Install the APK and validate the tunnel on Wi-Fi and 5G.

Any SSH password or private key embedded into the APK must be treated as
recoverable. Use a per-device key, restrict `PermitOpen` to the bridge loopback,
and rotate credentials when needed.

## Workspaces

Allowed workspaces are read from:

```text
config/workspaces.allowlist
```

The file is ignored by Git. Use `config/workspaces.allowlist.example` as the
template. The bridge also exposes workspace add/remove/restore endpoints, so the
mobile app can update the allowlist without rebuilding the APK.

## API

The bridge exposes an HTTP/SSE contract on loopback. The canonical endpoint
reference is in `backend/README.md`.

Start with:

- `GET /health`
- `GET /v1/capabilities`

The current API includes thread creation/listing/history, run streaming and
reattach, cancellation, workspace management, filesystem browsing, model/config
settings, account/rate-limit reads, apps, skills, MCP server/resource access,
approvals, and SSH status.

## Documentation

- `backend/README.md`: backend structure, runtime details, and endpoint list.
- `mobile/README.md`: mobile setup, build config, features, and app structure.
- `build-guide/README.md`: overview of the interactive Android build guide.
- `docs/ARCHITECTURE.md`: architecture decisions and trust boundaries.
- `docs/API_CONTRACT.md`: HTTP/SSE contract between mobile and bridge.
- `docs/SSH_USER_SETUP_GUIDE.md`: dedicated SSH user setup.
- `docs/SSH_TUNNEL_RUNBOOK.md`: SSH tunnel operation on local networks and 5G.
- `docs/MOBILE_ANDROID_BUILD_PLAYBOOK.md`: Android build playbook.
- `docs/SECURITY_DECISIONS.md`: embedded secret and tunnel security decisions.
- `docs/IMPLEMENTATION_PLAN.md`: implementation status and remaining work.

## Current State

The bridge and mobile app are implemented and operational for the internal
Android flow. Current functionality includes workspace selection, conversation
management, streaming chat, Markdown rendering, activity/tool timeline,
human-in-the-loop approvals, cancellation, model and reasoning controls, account
limits, execution presets, apps/skills/MCP navigation, settings, and SSH tunnel
management.

The main remaining work is hardening failure states and improving pairing and
operational security for broader internal use.
