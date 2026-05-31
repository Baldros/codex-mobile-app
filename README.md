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

## API

O bridge expoe a API HTTP/SSE em loopback. A referencia completa e canonica dos endpoints fica em `backend/README.md` (health/capabilities, threads, runs com SSE de stream e reanexar, workspaces, settings, apps/skills, MCP, aprovacoes e status do SSH). Comece por `GET /v1/capabilities` para descobrir o que o runtime ativo suporta.

## Estado atual

A fundacao tecnica, o bridge local e o app mobile estao implementados e operacionais. O app cobre selecao de workspace/modelo/conversa, chat em streaming com renderizacao Markdown, timeline de atividade e ferramentas, aprovacoes human-in-the-loop, cancelamento, mentions estruturadas (`$app`/`$skill`/`$mcp`), navegacao de recursos MCP, limites de conta e presets de modo de execucao, alem do SSH tunnel manager. As proximas etapas principais sao robustecer estados de falha no app e adicionar pareamento/seguranca operacional para uso interno em rede local ou 5G.
