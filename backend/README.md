# Codex Mobile Bridge

Backend local do app mobile. Ele expoe uma API HTTP/SSE em loopback e encapsula o runtime real do Codex.

## Comandos

```powershell
npm run dev
npm test
npm run typecheck
npm run build
npm run smoke:app-server
```

`smoke:app-server` sobe o Bridge em uma porta temporaria, valida `codex app-server`,
cria uma conversa real no historico nativo do Codex e confere o `cwd` da sessao.

## Estrutura

- `src/server.ts`: entrypoint do processo.
- `src/app.ts`: roteador HTTP/SSE (cria o servidor e despacha cada rota).
- `src/appServer/`: runtime `app-server` (cliente JSON-RPC via stdio e mapeamento de eventos).
- `src/runtime/`: runtimes `sdk` e `mock` e o mapeamento de eventos do SDK.
- `src/runs/`: registro de runs ativos, replay e reanexacao de eventos (`RunRegistry`).
- `src/threads/`: servico e store de conversas.
- `src/workspaces/`: allowlist de workspaces.

## Runtime

O bridge suporta tres runtimes:

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

Um path por linha. Linhas vazias e linhas com `#` sao ignoradas. O arquivo local fica fora do Git; use `config/workspaces.allowlist.example` como modelo. A rota `POST /v1/workspaces/add` permite incluir um diretorio existente sem rebuild do app mobile.

## API

Referencia completa dos endpoints HTTP/SSE. Esta e a fonte canonica; o README da raiz apenas resume e aponta para ca.

Sistema

- `GET /health`
- `GET /v1/capabilities`

Threads

- `GET /v1/threads` (filtra por `cwd`)
- `POST /v1/threads`
- `GET /v1/threads/:threadId` (`?include_turns=true` para o historico)
- `POST /v1/threads/:threadId/name` (renomear)
- `POST /v1/threads/:threadId/archive`
- `POST /v1/threads/:threadId/cancel`

Runs

- `POST /v1/threads/:threadId/runs/stream` (SSE: inicia o run e transmite os eventos)
- `POST /v1/threads/:threadId/runs` (inicia sem stream, retorna `run_id`)
- `GET /v1/runs/active` (`?thread_id=` / `?cwd=`)
- `GET /v1/runs/:runId`
- `GET /v1/runs/:runId/events/stream` (SSE: reanexa a um run em andamento, `?since_seq=`)

Workspaces

- `GET /v1/workspaces`
- `POST /v1/workspaces/add`
- `POST /v1/workspaces/remove`
- `POST /v1/workspaces/restore`

Settings

- `GET /v1/settings/models`
- `GET /v1/settings/config`
- `POST /v1/settings/config`
- `GET /v1/settings/account`
- `GET /v1/settings/features`

Apps, skills e MCP

- `GET /v1/apps`
- `GET /v1/skills`
- `GET /v1/mcp/servers`
- `POST /v1/mcp/resources/read`
- `POST /v1/mcp/reload`

Aprovacoes e setup

- `POST /v1/approvals/:approvalId/respond`
- `GET /v1/setup/ssh/status`

Rotas que dependem de capability (models, config, account, features, apps, skills, MCP, aprovacoes, rename) retornam erro quando o runtime ativo nao as suporta. Consulte `GET /v1/capabilities` para descobrir o que esta disponivel.

O servidor deve ficar em `127.0.0.1:8787`. O mobile acessa essa API por SSH tunnel.
