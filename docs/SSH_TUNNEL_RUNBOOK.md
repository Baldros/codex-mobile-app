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
| SSH publico | `22` ou porta alta encaminhada, por exemplo `39222` |

## Desktop

1. Instalar e iniciar OpenSSH Server.
2. Criar usuario dedicado, por exemplo `codex_mobile`.
3. Rodar o Codex Bridge vinculado a `127.0.0.1:8787`.
4. Confirmar que `http://127.0.0.1:8787/health` responde localmente.
5. Configurar roteador ou VPN para permitir entrada SSH quando for usar 5G.

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
CODEX_MOBILE_SSH_REMOTE_HOSTS=[2001:db8::10]:22,203.0.113.10:39222
CODEX_MOBILE_SSH_USERNAME=codex_mobile
CODEX_MOBILE_SSH_AUTH_MODE=private_key
CODEX_MOBILE_SSH_PRIVATE_KEY_PEM=...
CODEX_MOBILE_SSH_PASSWORD=...
CODEX_MOBILE_SSH_REMOTE_API_HOST=127.0.0.1
CODEX_MOBILE_SSH_REMOTE_API_PORT=8787
CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET=true
```

`CODEX_MOBILE_SSH_PASSWORD` e `CODEX_MOBILE_SSH_PRIVATE_KEY_PEM` nunca devem ser commitados.

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
- A porta SSH publica chega ao computador.
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
