# Codex Mobile

App mobile interno em Expo + React Native + TypeScript.

## Setup

Instale as dependencias dentro desta pasta:

```powershell
cd E:\codex-mobile-app\mobile
npm install
```

## Desenvolvimento visual

```powershell
npx expo start
```

Se o Metro mostrar `Unable to deserialize cloned data` ao ler o cache,
limpe o cache do Expo/Metro e inicie novamente:

```powershell
npm run start:clear
```

Para visualizar no navegador:

```powershell
npx expo start --web
```

Por padrao, no web o app tenta acessar:

```text
http://127.0.0.1:8787
```

Em mobile fisico, o default e:

```text
http://127.0.0.1:18080
```

Tambem e possivel sobrescrever no start:

```powershell
$env:EXPO_PUBLIC_BRIDGE_URL="http://127.0.0.1:8787"
npx expo start
```

## Build config SSH

Builds internos leem variaveis `CODEX_MOBILE_*` via `app.config.js`. Exemplo:

```powershell
$env:CODEX_MOBILE_GATEWAY="ssh_tunnel"
$env:CODEX_MOBILE_SSH_TUNNEL_LOCAL_URL="http://127.0.0.1:18080"
$env:CODEX_MOBILE_SSH_REMOTE_HOSTS="[SEU_IPV6]:22,SEU_IPV4_PUBLICO:39223"
$env:CODEX_MOBILE_SSH_USERNAME="seu_usuario"
$env:CODEX_MOBILE_SSH_PASSWORD="sua_senha"
$env:CODEX_MOBILE_SSH_REMOTE_API_HOST="127.0.0.1"
$env:CODEX_MOBILE_SSH_REMOTE_API_PORT="8787"
$env:CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET="true"
```

O modulo Android inicial de tunnel fica em `modules/codex-ssh-tunnel`. Ele exige dev build/APK nativo; Expo Go nao carrega esse modulo local.

## Scripts

```powershell
npm run typecheck
npm test
npm run web
```

## MVP implementado

- Health do Bridge.
- Selecao de repositorio via `GET /v1/workspaces`.
- Selecao de modelo via `GET /v1/settings/models`.
- Selecao de conversa via `GET /v1/threads?cwd=...`.
- Chat via `POST /v1/threads/:id/runs/stream`.
- Eventos estruturados de atividade, ferramentas e aprovacoes.
- Settings basico para URL do Bridge, approval policy, sandbox, network e defaults do Codex.
