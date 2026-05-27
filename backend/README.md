# Codex Mobile Bridge

Backend local do app mobile. Ele expoe uma API HTTP/SSE em loopback e encapsula o runtime real do Codex.

## Comandos

```powershell
npm run dev
npm test
npm run typecheck
npm run build
```

## Runtime

O bridge suporta dois runtimes:

- `app-server`: usa `codex app-server` via stdio JSON-RPC. Este e o runtime recomendado para historico nativo, settings e human-in-the-loop.
- `sdk`: usa `@openai/codex-sdk` e o Codex CLI local. Continua disponivel como adapter simples.
- `mock`: runtime deterministico para testes e desenvolvimento sem chamar Codex.

Configure com:

```powershell
$env:CODEX_BRIDGE_RUNTIME="mock"
npm run dev
```

## Workspaces

O Bridge le workspaces permitidos de:

```text
E:\codex-mobile-app\config\workspaces.allowlist
```

Um path por linha. Linhas vazias e linhas com `#` sao ignoradas. O arquivo local fica fora do Git; use `config/workspaces.allowlist.example` como modelo.

## API

- `GET /health`
- `GET /v1/workspaces`
- `GET /v1/threads`
- `POST /v1/threads`
- `GET /v1/threads/:threadId`
- `POST /v1/threads/:threadId/runs/stream`
- `POST /v1/threads/:threadId/cancel`
- `POST /v1/approvals/:approvalId/respond`
- `GET /v1/settings/models`
- `GET /v1/settings/config`
- `POST /v1/settings/config`
- `GET /v1/settings/account`
- `GET /v1/settings/features`
- `GET /v1/setup/ssh/status`

O servidor deve ficar em `127.0.0.1:8787`. O mobile acessa essa API por SSH tunnel.
