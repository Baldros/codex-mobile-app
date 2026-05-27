# API Contract

Contrato inicial entre mobile e Codex Bridge.

O contrato e HTTP + SSE para manter o mobile simples e permitir trocar a integracao interna do bridge sem quebrar o app.

## Base URL

No modo real:

```text
http://127.0.0.1:18080
```

Essa URL e local ao mobile e aponta para o SSH tunnel. O bridge real fica no desktop:

```text
http://127.0.0.1:8787
```

## Health

```http
GET /health
```

Resposta:

```json
{
  "status": "ok",
  "codex_ready": true,
  "auth": "ok",
  "bridge_version": "0.1.0",
  "codex_cli_version": "codex 0.0.0",
  "active_transport": "codex_sdk"
}
```

Campos:

- `status`: `ok`, `degraded` ou `error`.
- `codex_ready`: se o bridge consegue chamar o runtime Codex.
- `auth`: `ok`, `missing`, `expired` ou `unknown`.
- `active_transport`: `codex_sdk`, `app_server`, `exec` ou `mock`.

## Threads

```http
GET /v1/threads?limit=25&cursor=<cursor>&cwd=<path>&search=<term>&archived=false
```

Lista threads do historico nativo do Codex, filtradas pelos workspaces permitidos.

```http
POST /v1/threads
Content-Type: application/json

{
  "title": "Ajustar teste do bridge",
  "workspace": "E:\\codex-mobile-app"
}
```

Cria uma thread local. O `workspace` deve ser validado pelo bridge.

```http
GET /v1/threads/:threadId
```

Retorna metadados e ultimos eventos salvos da thread.

## Run Streaming

```http
POST /v1/threads/:threadId/runs/stream
Content-Type: application/json
Accept: text/event-stream

{
  "message": "Rode os testes e corrija a falha",
  "cwd": "E:\\codex-mobile-app",
  "approval_policy": "on-request",
  "sandbox_mode": "workspace-write"
}
```

Resposta SSE:

```text
event: run_started
data: {"thread_id":"thr_123","run_id":"run_123"}

event: agent_message_delta
data: {"thread_id":"thr_123","run_id":"run_123","text":"Vou verificar os testes."}

event: done
data: {"thread_id":"thr_123","run_id":"run_123","status":"completed"}
```

## Cancelamento

```http
POST /v1/threads/:threadId/cancel
Content-Type: application/json

{
  "run_id": "run_123"
}
```

O bridge deve tambem cancelar a run se o cliente desconectar do SSE.

## Workspaces

```http
GET /v1/workspaces
```

Retorna a allowlist de repositorios/workspaces disponiveis para o app:

```json
{
  "data": [
    {
      "path": "E:\\codex-mobile-app",
      "name": "codex-mobile-app",
      "exists": true,
      "is_git_repo": true,
      "source": "file"
    }
  ],
  "allowlist_file": "E:\\codex-mobile-app\\config\\workspaces.allowlist"
}
```

O arquivo usa um path por linha. Linhas vazias e linhas iniciadas por `#` sao ignoradas.

## Approvals

Quando o Codex pedir decisao humana, o stream SSE envia:

```text
event: approval_requested
data: {"approval_id":"42","approval_type":"command_execution","thread_id":"thr_123","run_id":"turn_123","command":"npm test","available_decisions":["accept","acceptForSession","decline","cancel"]}
```

Resposta do mobile:

```http
POST /v1/approvals/:approvalId/respond
Content-Type: application/json

{
  "decision": "accept"
}
```

Decisoes suportadas no MVP:

- `accept`
- `acceptForSession`
- `decline`
- `cancel`

## Settings

```http
GET /v1/settings/models
```

Lista modelos e opcoes de effort/service tier fornecidos pelo Codex.

```http
GET /v1/settings/config
```

Le a configuracao efetiva do Codex.

```http
POST /v1/settings/config
Content-Type: application/json

{
  "key_path": "model",
  "value": "gpt-5.5",
  "merge_strategy": "replace"
}
```

```http
GET /v1/settings/account
```

Le o estado de autenticacao local.

```http
GET /v1/settings/features
```

Lista feature flags conhecidas pelo Codex.

## SSH Status

```http
GET /v1/setup/ssh/status
```

Retorna informacoes de diagnostico que o mobile pode mostrar:

```json
{
  "mode": "ssh_tunnel",
  "local_url": "http://127.0.0.1:18080",
  "remote_api": "127.0.0.1:8787",
  "connected": true,
  "last_health_check_ms": 42,
  "active_endpoint": "203.0.113.10:39222"
}
```

## Eventos SSE

Eventos previstos:

- `heartbeat`: mantem conexao viva.
- `thread_started`: thread criada ou retomada.
- `run_started`: run criada.
- `agent_message_delta`: texto incremental para o usuario.
- `agent_message`: mensagem finalizada.
- `reasoning_summary`: resumo de raciocinio quando a API disponibilizar esse sinal.
- `tool_start`: ferramenta iniciada.
- `tool_end`: ferramenta finalizada.
- `command_output`: saida incremental ou consolidada de comando.
- `approval_requested`: o agente precisa de aprovacao.
- `file_change`: alteracao detectada ou aplicada.
- `error`: erro recuperavel ou terminal.
- `done`: run finalizada.

Formato obrigatorio:

```text
event: <event_name>
data: <json-compacto>
```

## Regras do Bridge

- Enviar heartbeat a cada 15 a 30 segundos durante runs longas.
- Encerrar a run se o cliente desconectar e nao houver modo background habilitado.
- Normalizar erros em JSON.
- Nunca vazar secrets nos eventos.
- Validar `cwd` contra uma allowlist configuravel.
- Manter compatibilidade mesmo se o backend interno mudar de SDK para app-server.

## Observacao sobre runtime interno

O contrato mobile permanece HTTP/SSE. Internamente, o Bridge pode usar `codex app-server`, `@openai/codex-sdk` ou runtime `mock`, mas o app mobile nao deve depender do protocolo JSON-RPC do app-server.
