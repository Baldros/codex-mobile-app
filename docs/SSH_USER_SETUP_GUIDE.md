# Guia de Configuração de Usuário SSH (Windows)

Este guia detalha o processo de criação de um usuário Windows dedicado para túneis SSH, garantindo o isolamento de segurança e a configuração correta das chaves públicas.

## 1. Criação do Usuário

Execute no PowerShell como **Administrador**:

```powershell
# Cria o usuário dedicado. Escolha uma senha forte.
net user codex_ssh SuaSenhaAqui /add

# (Opcional) Configura a conta para que a senha não expire
wmic useraccount where "Name='codex_ssh'" set PasswordExpires=FALSE
```

## 2. Geração da Chave SSH (No seu usuário principal)

No seu usuário de desenvolvedor (ex: `amori`):

```powershell
# Gera a chave no padrão ED25519 (mais moderna e segura)
# Quando perguntar por passphrase, deixe em branco para uso automatizado no mobile
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\codex_mobile_ed25519" -C "codex-mobile-android"
```

## 3. Configuração do `authorized_keys`

O OpenSSH no Windows é extremamente rigoroso com permissões. Se o arquivo estiver "aberto demais", o login por chave falhará silenciosamente e pedirá senha.

**Execute estes comandos como Administrador:**

### Etapa A: Preparação e Escrita
```powershell
# 1. Garante que a pasta .ssh existe no novo usuário
New-Item -ItemType Directory -Path "C:\Users\codex_ssh\.ssh" -Force

# 2. Lê a sua chave pública gerada anteriormente
$PubKey = Get-Content "C:\Users\amori\.ssh\codex_mobile_ed25519.pub" -Raw

# 3. Escreve o conteúdo no arquivo authorized_keys do novo usuário
$PubKey | Out-File -FilePath "C:\Users\codex_ssh\.ssh\authorized_keys" -Encoding ascii -Force
```

### Etapa B: Ajuste de Permissões (Crítico)
Para o SSH funcionar, **apenas** o usuário dono (`codex_ssh`) e o `SISTEMA` podem ter acesso ao arquivo.

```powershell
# 1. Retoma a posse do arquivo para o grupo de Administradores para poder alterar permissões
takeown /f "C:\Users\codex_ssh\.ssh\authorized_keys" /a

# 2. Concede acesso total ao seu usuário Admin atual para não perder o acesso no próximo passo
icacls "C:\Users\codex_ssh\.ssh\authorized_keys" /grant "Administradores:F"

# 3. Concede acesso ao usuário alvo (codex_ssh) e ao SISTEMA
icacls "C:\Users\codex_ssh\.ssh\authorized_keys" /grant "codex_ssh:F"
icacls "C:\Users\codex_ssh\.ssh\authorized_keys" /grant "SISTEMA:F"

# 4. Define o usuário alvo como o proprietário real do arquivo
icacls "C:\Users\codex_ssh\.ssh\authorized_keys" /setowner codex_ssh

# 5. Remove a herança de permissões (limpa acessos de outros usuários)
icacls "C:\Users\codex_ssh\.ssh\authorized_keys" /inheritance:r

# 6. Remove o acesso do grupo de Administradores (O SSH exige isso por segurança)
icacls "C:\Users\codex_ssh\.ssh\authorized_keys" /remove "Administradores"
```

*Repita o processo de permissões para a pasta `C:\Users\codex_ssh\.ssh` se necessário.*

## 4. Troubleshooting (Problemas Comuns)

### Acesso Negado ao rodar `icacls`
**Causa:** Ao remover a herança (`/inheritance:r`), o Administrador pode perder o direito de aplicar novos comandos se não for o dono.
**Solução:** Use sempre o `takeown /a` antes de reatribuir permissões se ficar travado.

### Nome de Grupo em Português vs Inglês
**Causa:** O Windows em Português usa `Administradores` e `SISTEMA`, enquanto em Inglês usa `Administrators` e `SYSTEM`.
**Solução:** Verifique o idioma do seu SO. O comando `net localgroup` ajuda a listar os nomes corretos.

### SSH continua pedindo senha
**Causa:** O serviço `sshd` pode estar configurado para ignorar chaves de usuários não-administradores ou as permissões do arquivo ainda estão incorretas.
**Solução:** Verifique os logs em `C:\ProgramData\ssh\logs\sshd.log`. Procure por "Authentication refused: bad ownership or modes".

## 5. Remoção do Usuário

Para limpar o ambiente e remover o usuário criado:

```powershell
# Remove o usuário do sistema
net user codex_ssh /delete

# Remove a pasta de perfil (CUIDADO: deleta todos os dados desse usuário)
Remove-Item -Recurse -Force "C:\Users\codex_ssh"
```

## 6. Resumo do Fluxo de Trabalho
1. Criar usuário com `net user`.
2. Criar pasta `.ssh` e arquivo `authorized_keys`.
3. Injetar chave pública.
4. Restringir acesso ao arquivo (Dono e Sistema apenas).
5. Testar com `ssh -i <chave> codex_ssh@127.0.0.1`.
