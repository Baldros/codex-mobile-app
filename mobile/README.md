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
