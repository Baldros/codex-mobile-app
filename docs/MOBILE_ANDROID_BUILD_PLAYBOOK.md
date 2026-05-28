# Codex Mobile Android - Build e Tunnel SSH

Playbook para a estrategia equivalente ao Atlas, adaptada para Expo + React Native.

Estado atual: o app ja le configuracao `CODEX_MOBILE_*` via `mobile/app.config.js`, resolve a URL padrao para `http://127.0.0.1:18080` no mobile fisico e inclui um modulo Android inicial `CodexSshTunnel` para abrir local port forward. Isso exige dev build/APK nativo; Expo Go nao carrega esse modulo local.

## 1. Subir o Bridge

```powershell
cd E:\codex-mobile-app\backend
$env:CODEX_BRIDGE_RUNTIME="app-server"
npm run build
npm run start
```

Validar em outro PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Esperado: `status=ok`, `codex_ready=true`, `active_transport=app-server`.

## 2. Validar SSH local

O Codex pode compartilhar o mesmo `sshd` do Atlas na porta local `22`.

Nesta maquina foi observado um usuario dedicado existente chamado `atlas_ssh`. Para o MVP, ele pode ser reaproveitado. Para isolamento melhor, crie um usuario `codex_mobile` ou use uma chave SSH separada para o Codex no mesmo usuario dedicado.

```powershell
cd E:\codex-mobile-app
.\scripts\validate_ssh_tunnel_ready.ps1 -SshPort 22
```

Se o Bridge ainda nao estiver rodando:

```powershell
.\scripts\validate_ssh_tunnel_ready.ps1 -SshPort 22 -SkipBridgeHealth
```

## 3. Preparar usuario e chave SSH

Recomendado para build interno:

- nao usar a conta principal do Windows;
- usar `atlas_ssh` ou `codex_mobile`;
- preferir chave SSH por app/dispositivo;
- deixar senha embutida apenas como fallback temporario.

Criar chave:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519" -C "codex-mobile-android"
```

Instalar a chave publica no usuario dedicado existente:

```powershell
$SshUser = "atlas_ssh"
$PublicKey = Get-Content "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519.pub" -Raw
$SshDir = "C:\Users\$SshUser\.ssh"
$AuthorizedKeys = "$SshDir\authorized_keys"

New-Item -ItemType Directory -Force -Path $SshDir | Out-Null
Add-Content -Path $AuthorizedKeys -Value $PublicKey
```

Validar login com a chave:

```powershell
ssh -i "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519" atlas_ssh@127.0.0.1 -p 22
```

## 4. Configurar endpoints do build

Use uma porta publica diferente da porta publica do Atlas, mas encaminhando para o mesmo `sshd` local em `22`.

Com chave privada:

```powershell
$env:CODEX_MOBILE_GATEWAY = "ssh_tunnel"
$env:CODEX_MOBILE_API_BASE_URL = "http://127.0.0.1:18080"
$env:CODEX_MOBILE_SSH_TUNNEL_LOCAL_URL = "http://127.0.0.1:18080"
$env:CODEX_MOBILE_SSH_REMOTE_HOSTS = "[SEU_IPV6]:22,SEU_IPV4_PUBLICO:39223"
$env:CODEX_MOBILE_SSH_USERNAME = "atlas_ssh"
$env:CODEX_MOBILE_SSH_AUTH_MODE = "private_key"
$env:CODEX_MOBILE_SSH_PRIVATE_KEY_PEM = Get-Content "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519" -Raw
$env:CODEX_MOBILE_SSH_REMOTE_API_HOST = "127.0.0.1"
$env:CODEX_MOBILE_SSH_REMOTE_API_PORT = "8787"
$env:CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET = "true"
```

Com senha, se ainda for necessario:

```powershell
$env:CODEX_MOBILE_SSH_AUTH_MODE = "password"
$env:CODEX_MOBILE_SSH_PASSWORD = "sua_senha"
```

Para IPv4, configure o roteador como:

```text
SEU_IPV4_PUBLICO:39223 -> desktop:22
```

## 5. Rodar em desenvolvimento

Para desenvolvimento visual/web, use acesso direto no Bridge:

```powershell
cd E:\codex-mobile-app\mobile
$env:EXPO_PUBLIC_BRIDGE_URL="http://127.0.0.1:8787"
npm run web
```

Para testar o tunnel embutido no Android, use dev build nativo:

```powershell
cd E:\codex-mobile-app\mobile
npx expo run:android
```

Ou com EAS/internal build:

```powershell
npx eas-cli build --platform android --profile internal
```

O perfil `internal` esta em `mobile/eas.json`. Endpoints e credenciais sensiveis devem vir do ambiente local ou de secrets do EAS, nao do arquivo.

## 6. Validacao no app

Na tela Settings, confira:

- `Gateway`: `ssh_tunnel`
- `Local URL`: `http://127.0.0.1:18080`
- `Remote API`: `127.0.0.1:8787`
- `SSH endpoints`: inclui IPv6 direto em `:22` e IPv4 publico em `:39223`
- `Config`: `ok` quando endpoints, usuario, segredo e confirmacao explicita estiverem definidos

## 7. Pendencias da fatia Android

O MVP do tunnel esta conectado ao cliente HTTP/SSE, mas ainda falta validar em aparelho fisico e robustecer operacao:

- build Android real com o modulo local autolinkado;
- teste em 5G com `SEU_IPV4_PUBLICO:39223 -> desktop:22`;
- reconnect com backoff em watchdog periodico;
- host key pinning ou trust-on-first-use;
- painel de status mais completo fora de Settings.
