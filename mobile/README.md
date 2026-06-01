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

## Funcionalidades

- Health e capabilities do Bridge.
- Selecao de repositorio (`GET /v1/workspaces`), com adicionar/remover da allowlist (`POST /v1/workspaces/add|remove|restore`).
- Selecao de modelo, reasoning effort e service tier (`GET /v1/settings/models`).
- Gestao de conversas (`GET /v1/threads?cwd=...`), incluindo renomear e arquivar.
- Chat em streaming (`POST /v1/threads/:id/runs/stream`) com renderizacao Markdown.
- Timeline estruturada de atividade, ferramentas e aprovacoes human-in-the-loop, com cancelamento.
- Mentions estruturadas no composer (`$app` / `$skill` / `$mcp`) e navegacao de recursos MCP.
- Limites de conta e presets de modo de execucao (sandbox, approval policy, network).
- Settings para URL do Bridge, build do tunnel SSH e defaults do Codex.

## Estrutura

- `src/screens/`: telas (`HomeScreen`, `SettingsScreen`, `ConversationsScreen`, `RepositoriesScreen`).
  - `src/screens/home/` e `src/screens/settings/`: subcomponentes e `styles.ts` de cada tela grande.
- `src/components/`: componentes reutilizaveis (`IconAction`, `MarkdownText`, `Screen`, ...).
- `src/state/BridgeProvider.tsx`: estado central e cliente do bridge (contexto React, hook `useBridge`).
- `src/domain/`: tipos e logica de dominio (tipos do bridge, mentions, partes de mensagem, parsing de historico, opcoes do composer).
- `src/api/`: cliente HTTP/SSE. `src/transport/`: SSH tunnel manager.
- `src/config/`, `src/storage/`, `src/theme/`, `src/utils/`: build config, preferencias, tema e utilidades.
- `modules/codex-ssh-tunnel/`: modulo nativo Android do tunnel (exige dev build/APK).
