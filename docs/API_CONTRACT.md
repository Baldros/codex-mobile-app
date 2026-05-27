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
GET /v1/threads
```

Lista threads conhecidas pelo bridge.

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

## Observacao sobre Codex SDK

O MVP pode entregar menos granularidade de evento se o transporte inicial via SDK nao expuser todos os sinais. O contrato mobile deve permanecer estavel; o bridge pode mapear eventos ausentes para mensagens finais ate que o app-server ou outro transporte mais rico seja ativado.
