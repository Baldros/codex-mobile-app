# Implementation Plan

## Fase 0: Fundacao

Status: em andamento.

Entregas:

- Arquitetura alvo.
- Contrato HTTP/SSE.
- Runbook SSH.
- Decisao sobre credencial embutida.
- Script de validacao inicial.

## Fase 1: Codex Bridge

Status: implementado com runtime `app-server`, SDK fallback e runtime `mock`.

Stack:

- Node.js 18+.
- TypeScript.
- `@openai/codex-sdk`.

Entregas:

- `GET /health`: implementado.
- `GET /v1/workspaces`: implementado.
- `GET /v1/threads`: implementado.
- `POST /v1/threads`: implementado.
- `GET /v1/threads/:threadId`: implementado.
- `POST /v1/threads/:threadId/runs/stream`: implementado.
- `POST /v1/threads/:threadId/cancel`: implementado.
- `POST /v1/approvals/:approvalId/respond`: implementado.
- `GET /v1/settings/models`: implementado.
- `GET /v1/settings/config`: implementado.
- `POST /v1/settings/config`: implementado.
- `GET /v1/settings/account`: implementado.
- `GET /v1/settings/features`: implementado.
- `GET /v1/setup/ssh/status`: implementado.
- SSE com `heartbeat`, `run_started`, `thread_started`, `agent_message`, `tool_start`, `tool_end`, `file_change`, `error`, `done`.
- Configuracao de workspace allowlist: implementada.
- Runtime `mock` para teste e desenvolvimento: implementado.
- Runtime `sdk` via `@openai/codex-sdk`: implementado.
- Runtime `app-server` via stdio JSON-RPC: implementado.
- Testes de contrato: implementados com Vitest.

Pendencias desta fase:

- Autorizacao local adicional no bridge, se necessario.
- Expandir testes com um processo fake de app-server para exercitar mais cenarios de JSON-RPC.

## Fase 2: Mobile Shell

Entregas:

- App shell.
- Chat basico.
- Gateway `mock`.
- Gateway `http`.
- Gateway `ssh_tunnel`.
- Tela de diagnostico de transporte.
- Parser SSE com buffer incremental.

## Fase 3: SSH Tunnel Manager

Entregas:

- Config por build/env: implementado para Expo via `CODEX_MOBILE_*`.
- Suporte a endpoints multiplos: implementado no manager Android inicial.
- Autenticacao por senha: implementado no modulo Android inicial.
- Autenticacao por chave privada: implementado no modulo Android inicial.
- Health check antes de chamadas HTTP/SSE: implementado via `ensureTransportReady`.
- Reconnect com backoff: pendente como watchdog periodico.
- Host key pinning ou pareamento trust-on-first-use: pendente.

## Fase 4: Historico nativo

Entregas:

- Usar `~/.codex/sessions` via `codex app-server`.
- Listar threads por workspace.
- Ler thread e turns paginadas.
- Retomar thread existente sem banco proprio.

## Fase 5: Eventos ricos e aprovacoes

Entregas:

- Normalizar eventos JSON-RPC para SSE: implementado para eventos principais.
- `approval_requested`: implementado.
- Resposta de aprovacao pelo mobile: implementado para decisoes basicas.
- Streaming de tool/command output: implementado.
- Completar tipos de approval menos comuns conforme aparecerem no app.

## Fase 6: Pareamento

Entregas:

- QR code de onboarding.
- Token efemero.
- Pinagem de host key.
- Cadastro de chave publica por dispositivo.
- Revogacao simples.

## Fase 7: Rollout interno

Entregas:

- Build profile por dev.
- Runbook de 5G.
- Diagnostico de NAT/firewall.
- Checklist de rotacao.
- Smoke tests em Windows e Android.

## Backlog inicial

1. Criar workspace Node/TypeScript do bridge.
2. Implementar `/health` com checagem do Codex CLI.
3. Provar uma run simples via Codex SDK.
4. Converter resultado para SSE.
5. Adicionar cancelamento.
6. Criar testes de contrato HTTP.
7. Escolher stack mobile final.
8. Implementar app shell e chat.
9. Implementar parser SSE.
10. Implementar gateway mock.
11. Implementar gateway HTTP local.
12. Portar o desenho do SSH tunnel manager do Atlas.
13. Adicionar tela de status do tunnel.
14. Adicionar perfil interno com credencial embutida.
15. Validar fluxo em 5G com bridge local.
