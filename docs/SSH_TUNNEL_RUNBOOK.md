# SSH Tunnel Runbook

Runbook operacional para o modo mobile via SSH tunnel.

Este material assume uso interno por desenvolvedores. O objetivo e expor somente SSH para fora e manter o Codex Bridge em loopback.

## Portas padrao

| Item | Valor |
| --- | --- |
| Bridge desktop | `127.0.0.1:8787` |
| URL local no mobile | `http://127.0.0.1:18080` |
| API remota via SSH | `127.0.0.1:8787` |
| SSH local | `22` |
| SSH publico | `22` ou porta alta encaminhada para o `22` local, por exemplo `39223` |

## Compartilhando o sshd com o Atlas

O Atlas e o Codex Mobile podem usar o mesmo servico `sshd` em `22`. O que precisa ser diferente sao as portas HTTP locais do tunnel e, se desejado, as portas publicas de entrada no roteador.

Exemplo:

```text
Atlas publico 39222 -> desktop sshd 22 -> 127.0.0.1:8000
Codex publico 39223 -> desktop sshd 22 -> 127.0.0.1:8787
```

Nesse desenho nao ha um segundo `sshd`. O app Codex disca `SEU_IPV4_PUBLICO:39223`, mas o roteador encaminha essa porta publica para o `22` da maquina.

Para IPv6 direto, normalmente nao ha NAT de porta. Use `[SEU_IPV6]:22`, a menos que o `sshd` tambem esteja configurado para escutar outra porta.

## Desktop

1. Instalar e iniciar OpenSSH Server.
2. Criar ou escolher usuario dedicado, por exemplo `codex_mobile` ou `atlas_ssh`.
3. Rodar o Codex Bridge vinculado a `127.0.0.1:8787`.
4. Confirmar que `http://127.0.0.1:8787/health` responde localmente.
5. Configurar roteador ou VPN para permitir entrada SSH quando for usar 5G.

## Usuario e chave SSH

Para MVP interno, reaproveitar um usuario dedicado existente como `atlas_ssh` e aceitavel. O ponto importante e nao usar a conta principal do Windows no APK.

Preferencia operacional:

1. usuario dedicado sem privilegio administrativo;
2. chave SSH por app ou por dispositivo;
3. senha embutida apenas para builds internos temporarios;
4. possibilidade simples de revogar a chave removendo uma linha de `authorized_keys`.

### Ver usuarios locais

```powershell
Get-LocalUser | Select-Object Name,Enabled,Description
```

### Criar usuario dedicado opcional

Execute em PowerShell como Administrador:

```powershell
$Password = Read-Host "Senha temporaria do usuario codex_mobile" -AsSecureString
New-LocalUser -Name codex_mobile -Password $Password -Description "Usuario dedicado para tunnel SSH do Codex Mobile"
```

Nao adicione esse usuario ao grupo `Administrators`.

### Criar chave SSH para o app

No desktop que vai fazer o build:

```powershell
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519" -C "codex-mobile-android"
```

Instale a chave publica no usuario SSH escolhido. Exemplo usando `atlas_ssh`:

```powershell
$SshUser = "atlas_ssh"
$PublicKey = Get-Content "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519.pub" -Raw
$UserProfile = "C:\Users\$SshUser"
$SshDir = Join-Path $UserProfile ".ssh"
$AuthorizedKeys = Join-Path $SshDir "authorized_keys"

New-Item -ItemType Directory -Force -Path $SshDir | Out-Null
Add-Content -Path $AuthorizedKeys -Value $PublicKey
```

Se o perfil `C:\Users\<usuario>` ainda nao existir, faca um login local uma vez com esse usuario ou crie o usuario `codex_mobile` e valide o SSH com senha antes de instalar a chave.

Valide a chave:

```powershell
ssh -i "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519" atlas_ssh@127.0.0.1 -p 22
```

Para build Android, leia a chave privada para uma variavel local de ambiente:

```powershell
$env:CODEX_MOBILE_SSH_AUTH_MODE = "private_key"
$env:CODEX_MOBILE_SSH_PRIVATE_KEY_PEM = Get-Content "$env:USERPROFILE\.ssh\codex_mobile_android_ed25519" -Raw
$env:CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET = "true"
```

Nunca commite a chave privada, `.env` local ou logs contendo esses valores.

## Hardening recomendado do sshd

Exemplo de bloco para `sshd_config`:

```text
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
AllowUsers codex_mobile
AllowTcpForwarding local
PermitOpen 127.0.0.1:8787
X11Forwarding no
AllowAgentForwarding no
MaxAuthTries 2
LoginGraceTime 20
```

Para builds internos que decidirem manter senha embutida:

```text
PasswordAuthentication yes
```

Essa excecao deve vir acompanhada de:

- usuario dedicado;
- senha forte e unica por dev;
- firewall ou porta publica controlada;
- `PermitOpen 127.0.0.1:8787`;
- rotacao quando o APK ou aparelho sair do controle do usuario.

## Variaveis de build do mobile

```text
CODEX_MOBILE_GATEWAY=ssh_tunnel
CODEX_MOBILE_API_BASE_URL=http://127.0.0.1:18080
CODEX_MOBILE_SSH_TUNNEL_LOCAL_URL=http://127.0.0.1:18080
CODEX_MOBILE_SSH_REMOTE_HOSTS=[2001:db8::10]:22,203.0.113.10:39223
CODEX_MOBILE_SSH_USERNAME=codex_mobile
CODEX_MOBILE_SSH_AUTH_MODE=private_key
CODEX_MOBILE_SSH_PRIVATE_KEY_PEM=...
CODEX_MOBILE_SSH_PASSWORD=...
CODEX_MOBILE_SSH_REMOTE_API_HOST=127.0.0.1
CODEX_MOBILE_SSH_REMOTE_API_PORT=8787
CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET=true
```

`CODEX_MOBILE_SSH_PASSWORD` e `CODEX_MOBILE_SSH_PRIVATE_KEY_PEM` nunca devem ser commitados.

No Expo, essas variaveis sao lidas pelo `mobile/app.config.js` no momento do build e expostas ao app em `extra.codexMobile`. Mesmo sem prefixo `EXPO_PUBLIC_`, qualquer segredo embutido no APK deve ser tratado como recuperavel.

## Sequencia de startup no mobile

1. Ler configuracao de build.
2. Validar host, usuario, porta local e porta remota.
3. Testar endpoints SSH em cascata.
4. Abrir local forward `127.0.0.1:18080 -> 127.0.0.1:8787`.
5. Chamar `GET http://127.0.0.1:18080/health`.
6. Liberar UI real somente depois de health positivo.
7. Manter watchdog de health e reconnect com backoff.

## Teste em 5G

Checklist:

- O computador esta ligado e sem suspensao automatica.
- O Codex Bridge responde em `http://127.0.0.1:8787/health`.
- O sshd esta rodando.
- A porta SSH publica chega ao computador. Se estiver usando porta publica alta, ela deve encaminhar para o `22` local do desktop.
- O usuario dedicado consegue autenticar.
- O sshd permite `PermitOpen 127.0.0.1:8787`.
- O mobile esta fora do Wi-Fi e usando 5G.
- A URL local no mobile e `http://127.0.0.1:18080/health`.

## Erros comuns

| Sintoma | Causa provavel | Acao |
| --- | --- | --- |
| Timeout no SSH | Porta publica fechada, CGNAT ou IP errado | Validar IP publico, NAT, roteador ou VPN |
| SSH autentica mas health falha | Bridge parado ou porta errada | Testar `/health` no desktop |
| `PermitOpen` nega conexao | Porta remota diferente | Conferir `127.0.0.1:8787` |
| Funciona no Wi-Fi mas nao no 5G | NAT/roteador/firewall | Testar porta externa a partir de outra rede |
| Health oscila | computador suspendendo ou rede instavel | Ajustar energia e backoff |

## Validacao local

Use:

```powershell
.\scripts\validate_ssh_tunnel_ready.ps1
```

Enquanto o bridge ainda nao existir, use:

```powershell
.\scripts\validate_ssh_tunnel_ready.ps1 -SkipBridgeHealth
```
