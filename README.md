# Codex Mobile App

Companion mobile interno para operar uma sessao local do Codex CLI/harness com seguranca de rede baseada em SSH tunnel.

## Direcao tecnica

O app mobile nao fala diretamente com a API da OpenAI e nao importa o Codex SDK no cliente. A arquitetura alvo e:

```text
Mobile app
  -> http://127.0.0.1:18080
  -> SSH local port forward
  -> desktop 127.0.0.1:8787
  -> Codex Bridge Node/TypeScript
  -> codex app-server, Codex SDK, ou codex exec
  -> Codex CLI/harness local
```

Essa direcao segue a documentacao oficial atual do Codex:

- Codex SDK: https://developers.openai.com/codex/sdk
- Codex app-server: https://developers.openai.com/codex/app-server
- Codex CLI reference: https://developers.openai.com/codex/cli/reference
- Remote app-server notes: https://developers.openai.com/codex/cli/features#connect-the-tui-to-a-remote-app-server

## Convencoes

- Bridge local: `127.0.0.1:8787`
- Porta local no mobile: `127.0.0.1:18080`
- Porta remota encaminhada pelo SSH: `127.0.0.1:8787`
- Transporte mobile padrao: `ssh_tunnel`
- Stack do bridge: Node.js + TypeScript
- Stack do app: Expo + React Native + TypeScript

## Documentos

- `docs/ARCHITECTURE.md`: arquitetura alvo e decisoes vindas do Atlas Desktop Agent.
- `docs/API_CONTRACT.md`: contrato HTTP/SSE entre mobile e bridge.
- `docs/SSH_TUNNEL_RUNBOOK.md`: operacao do SSH tunnel em rede local e 5G.
- `docs/MOBILE_ANDROID_BUILD_PLAYBOOK.md`: build Android interno e variaveis `CODEX_MOBILE_*`.
- `docs/SECURITY_DECISIONS.md`: decisao sobre senha/chave SSH embutida.
- `docs/IMPLEMENTATION_PLAN.md`: plano incremental de implementacao.

## Backend

O backend local esta em `backend/`. Ele expoe uma API HTTP/SSE em loopback, normaliza o contrato para o mobile e encapsula o runtime real do Codex.

```powershell
cd backend
npm install
npm run dev
npm test
npm run typecheck
npm run build
npm run smoke:app-server
```

Runtimes suportados:

- `app-server`: recomendado para historico nativo, settings e human-in-the-loop.
- `sdk`: adapter simples via `@openai/codex-sdk`.
- `mock`: runtime deterministico para testes e desenvolvimento sem chamar Codex.

Exemplo para rodar em modo mock:

```powershell
$env:CODEX_BRIDGE_RUNTIME="mock"
npm run dev
```

## Mobile

O app mobile esta em `mobile/`. O MVP atual ja inclui shell operacional, selecao de workspace/modelo/conversa, chat por SSE, eventos de atividade, aprovacoes pendentes, cancelamento e tela basica de settings.

```powershell
cd mobile
npm install
npx expo start
```

Use `npx expo start --web` ou `npm run web` para visualizar rapidamente no navegador durante o desenvolvimento.

URLs default:

- Web/dev local: `http://127.0.0.1:8787`
- Mobile fisico: `http://127.0.0.1:18080`

Para sobrescrever a URL do bridge:

```powershell
$env:EXPO_PUBLIC_BRIDGE_URL="http://127.0.0.1:8787"
npx expo start
```

## Workspaces

Os workspaces permitidos ficam em:

```text
config/workspaces.allowlist
```

Um path por linha. O arquivo local e ignorado pelo Git; `config/workspaces.allowlist.example` serve de modelo.

## API implementada

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

## Estado atual

Este repositorio tem a fundacao tecnica, o bridge local e o shell mobile inicial implementados. As proximas etapas principais sao robustecer estados de falha no app, evoluir o SSH tunnel manager mobile e adicionar pareamento/seguranca operacional para uso interno em rede local ou 5G.
