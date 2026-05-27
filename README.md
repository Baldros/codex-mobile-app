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

## Estado atual

Este repositorio esta na fase de fundacao tecnica: arquitetura, contratos e runbooks. A implementacao do bridge e do app mobile vem depois desses limites ficarem estaveis.
