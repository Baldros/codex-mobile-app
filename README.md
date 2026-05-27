# Codex Mobile App

Companion mobile interno para operar um harness local do Codex CLI com seguranca de rede baseada em SSH tunnel.

## Direcao tecnica

O app mobile nao deve falar diretamente com a API da OpenAI nem importar o Codex SDK no cliente. A arquitetura alvo e:

```text
Mobile app
  -> http://127.0.0.1:18080
  -> SSH local port forward
  -> desktop 127.0.0.1:8787
  -> Codex Bridge Node/TypeScript
  -> Codex SDK, codex app-server, ou codex exec
  -> Codex CLI/harness local
```

Essa direcao segue a documentacao oficial atual do Codex:

- Codex SDK: https://developers.openai.com/codex/sdk
- Codex app-server: https://developers.openai.com/codex/app-server
- Codex CLI reference: https://developers.openai.com/codex/cli/reference
- Remote app-server notes: https://developers.openai.com/codex/cli/features#connect-the-tui-to-a-remote-app-server

## Convencoes iniciais

- Bridge local: `127.0.0.1:8787`
- Porta local no mobile: `127.0.0.1:18080`
- Porta remota encaminhada pelo SSH: `127.0.0.1:8787`
- Transporte mobile padrao: `ssh_tunnel`
- Stack do bridge: Node/TypeScript, alinhada ao Codex SDK

## Documentos

- `docs/ARCHITECTURE.md`: arquitetura alvo e decisoes vindas do Atlas Desktop Agent.
- `docs/API_CONTRACT.md`: contrato HTTP/SSE entre mobile e bridge.
- `docs/SSH_TUNNEL_RUNBOOK.md`: operacao do SSH tunnel em rede local e 5G.
- `docs/SECURITY_DECISIONS.md`: decisao sobre senha/chave SSH embutida.
- `docs/IMPLEMENTATION_PLAN.md`: plano incremental de implementacao.

## Backend

O backend MVP esta em `backend/`:

```powershell
cd backend
npm run dev
npm test
npm run typecheck
npm run build
```

Ele implementa o Codex Bridge local com API HTTP/SSE, runtime principal via `codex app-server`, adapter via `@openai/codex-sdk` e runtime `mock` para testes.

Os workspaces permitidos ficam em:

```text
config/workspaces.allowlist
```

Um path por linha. O arquivo local e ignorado pelo Git; `config/workspaces.allowlist.example` serve de modelo.

## Estado atual

Este repositorio tem a fundacao tecnica e a primeira versao do backend local. A proxima etapa e evoluir o cliente mobile e o SSH tunnel manager.
