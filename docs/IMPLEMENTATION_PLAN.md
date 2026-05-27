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

Stack:

- Node.js 18+.
- TypeScript.
- `@openai/codex-sdk`.

Entregas:

- `GET /health`.
- `GET /v1/threads`.
- `POST /v1/threads`.
- `POST /v1/threads/:threadId/runs/stream`.
- `POST /v1/threads/:threadId/cancel`.
- SSE com `heartbeat`, `run_started`, `agent_message`, `error`, `done`.
- Configuracao de workspace allowlist.
- Testes de contrato.

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

- Config por build/env.
- Suporte a endpoints multiplos.
- Autenticacao por senha.
- Autenticacao por chave privada.
- Health check antes de liberar UI.
- Reconnect com backoff.
- Host key pinning ou pareamento trust-on-first-use.

## Fase 4: Persistencia

Entregas:

- Indice local de threads no bridge.
- SQLite com WAL e busy timeout.
- Historico minimo para retomada.
- Limpeza de runs antigas.

## Fase 5: Eventos ricos e aprovacoes

Entregas:

- Avaliar `codex app-server` por tras do bridge.
- Normalizar eventos JSON-RPC para SSE.
- `approval_requested`.
- Resposta de aprovacao pelo mobile.
- Streaming de tool/command output.

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
