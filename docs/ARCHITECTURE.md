# Architecture

## Objetivo

Criar um app mobile interno que controle uma sessao local do Codex CLI/harness rodando na maquina do desenvolvedor.

O app mobile deve ser um cliente de operacao. O desktop continua sendo o limite de confianca onde ficam:

- Codex CLI.
- Login e credenciais OpenAI.
- Workspace local.
- Permissoes de shell e filesystem.
- Bridge que traduz comandos mobile para Codex SDK ou Codex app-server.

## Fora de escopo

- Expor a API da OpenAI diretamente no mobile.
- Rodar Codex SDK dentro do app mobile.
- Reaproveitar a stack Python/FastAPI/LangChain do Atlas.
- Abrir o bridge na rede publica.
- Fazer um produto multi-tenant ou comercial nesta fase.

## Desenho alvo

```text
Mobile UI
  -> HTTP/SSE em loopback local
  -> SSH tunnel embutido no app
  -> sshd na maquina do dev
  -> Codex Bridge em 127.0.0.1:8787
  -> @openai/codex-sdk ou codex app-server
  -> Codex CLI/harness local
```

O trafego HTTP entre mobile e bridge passa por `127.0.0.1` nos dois lados do tunnel:

- No mobile: `http://127.0.0.1:18080`.
- No desktop: `http://127.0.0.1:8787`.

O unico servico exposto para acesso remoto deve ser SSH.

## Componentes

### Mobile App

Responsabilidades:

- Manter um SSH local port forward.
- Exibir status do transporte.
- Consumir HTTP/SSE do bridge.
- Enviar prompts, cancelamentos e aprovacoes.
- Persistir preferencias locais nao sensiveis.
- Armazenar ou embutir credencial SSH conforme perfil interno escolhido.

Padrao reaproveitado do Atlas:

- `ensureTransportReady` antes de cada chamada real.
- Fallback de endpoints IPv4/IPv6.
- Health check periodico.
- Reconnect com backoff.
- Logs curtos de diagnostico para suporte.

### Codex Bridge

Responsabilidades:

- Rodar localmente e vincular somente em `127.0.0.1`.
- Normalizar uma API HTTP/SSE estavel para o mobile.
- Encapsular diferencas entre Codex SDK, `codex app-server` e `codex exec`.
- Controlar cancelamento, heartbeats e historico de threads.
- Aplicar autorizacao local simples quando necessario.

Stack alvo:

- Node.js 18+.
- TypeScript.
- `@openai/codex-sdk` como caminho preferencial para MVP.

### Codex Runtime

Opcoes de integracao:

- `@openai/codex-sdk`: preferido para MVP programatico.
- `codex app-server`: opcao para experiencia rica com eventos, historico, aprovacoes e JSON-RPC 2.0. A documentacao marca partes do app-server como experimentais.
- `codex exec --json`: fallback estavel para tarefas nao interativas ou automacoes simples.

## Decisoes trazidas do Atlas

### SSH tunnel como fronteira de rede

O Atlas ja validou o padrao:

```text
mobile 127.0.0.1:<local-port>
  -> SSH local forward
desktop 127.0.0.1:<api-port>
```

Esse padrao sera mantido porque evita expor HTTP na internet e funciona em 5G quando ha uma rota SSH valida para a maquina do desenvolvedor.

### Gateway de transporte

O mobile deve ter uma abstracao de transporte:

- `mock`: desenvolvimento de UI.
- `http`: acesso local direto durante desenvolvimento.
- `ssh_tunnel`: modo real.

Toda chamada ao bridge passa por `ensureTransportReady`.

### SSE como contrato de streaming

O bridge entrega eventos por SSE. Isso simplifica o cliente mobile e cobre:

- mensagens incrementais;
- status de ferramenta;
- solicitacoes de aprovacao;
- erros;
- heartbeats;
- conclusao.

### Persistencia leve

Se o bridge precisar de indice local de threads, usar SQLite com:

- `journal_mode=WAL`;
- `busy_timeout`;
- schema pequeno;
- metadados de thread/run, nao snapshots grandes do workspace.

### Runbooks primeiro

O Atlas mostrou que mobile + SSH + rede domestica falha mais por operacao do que por codigo. Por isso este repo inclui runbooks e script de validacao desde o inicio.

## Portas

| Papel | Default |
| --- | --- |
| Bridge desktop | `127.0.0.1:8787` |
| Mobile local forward | `127.0.0.1:18080` |
| SSH | `22` ou porta publica encaminhada |

## Modelo de confianca

O mobile e confiavel apenas como cliente interno. Ele nao deve receber credenciais OpenAI. Uma perda do celular ou APK pode comprometer a credencial SSH embutida, mas nao deve expor acesso amplo se o sshd estiver restrito a um usuario dedicado e a `PermitOpen 127.0.0.1:8787`.
