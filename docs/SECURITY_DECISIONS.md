# Security Decisions

## Decisao: credencial SSH embutida

Credencial SSH embutida no app nao e um impedimento tecnico.

Ela e, porem, uma decisao de seguranca real, nao apenas manutencao. Qualquer senha, chave privada ou token colocado dentro do APK, IPA, bundle, asset, constante de build ou storage local deve ser tratado como recuperavel por alguem com acesso ao binario, ao aparelho, a um backup ou a um ambiente de debug.

Para este projeto interno, a decisao e suportar credencial SSH embutida como perfil de build interno, desde que o risco seja limitado por configuracao de sshd, usuario dedicado e rotacao.

## Quando e aceitavel

Aceitavel para uso interno quando todas as condicoes abaixo forem verdadeiras:

- Cada dev gera sua propria credencial.
- Cada dev builda seu proprio app ou recebe build individual.
- A credencial e por usuario ou por dispositivo.
- O usuario SSH e dedicado ao tunnel, nao e a conta principal do sistema.
- O sshd restringe forwarding com `PermitOpen 127.0.0.1:8787`.
- O bridge fica vinculado somente a `127.0.0.1`.
- O host key do servidor e pinado ou validado no primeiro pareamento.
- Existe processo simples de revogacao.
- O APK/IPA nao e compartilhado fora da equipe.

## Quando vira risco grave

O risco fica alto se:

- a mesma senha ou chave for compartilhada por varios usuarios;
- a credencial permitir login em conta administrativa ou conta pessoal do dev;
- o sshd permitir forwarding amplo para qualquer host/porta;
- o SSH estiver exposto na internet com senha fraca;
- nao houver rotacao quando um aparelho ou build vazar;
- o app for distribuido fora da equipe interna;
- secrets forem commitados no repositorio.

## Senha vs chave privada

Senha embutida:

- Mais simples para builds manuais.
- Mais facil de digitar e rotacionar.
- Mais sujeita a ataque online se SSH estiver exposto e sem rate limit.
- Nao permite revogar um dispositivo especifico sem trocar a senha daquele usuario.

Chave privada embutida:

- Melhor para revogar por dispositivo via `authorized_keys`.
- Evita password brute force se `PasswordAuthentication no`.
- Continua sendo extraivel do app se estiver embutida.
- Exige cuidado com passphrase e armazenamento local.

Preferencia tecnica: chave por dispositivo ou por dev, com `PasswordAuthentication no`.

Opcao aceita para fase interna: senha por dev em build proprio, com hardening e rotacao.

## Controles obrigatorios

Config de build deve exigir uma confirmacao explicita:

```text
CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET=true
```

Tambem deve declarar o modo:

```text
CODEX_MOBILE_SSH_AUTH_MODE=password
```

ou:

```text
CODEX_MOBILE_SSH_AUTH_MODE=private_key
```

O app deve mostrar em tela de diagnostico que esta em perfil interno com credencial embutida, sem revelar o valor.

## Regras de repositorio

- Nao commitar `.env`, `.env.local`, keystores, chaves privadas ou senhas.
- Manter `.env.example` sem valores reais.
- Preferir injecao por CI, script local ou `--dart-define`/equivalente da stack escolhida.
- Tratar logs como sensiveis.

## Regras no desktop

Usuario dedicado:

```text
codex_mobile
```

Restricoes recomendadas:

```text
AllowUsers codex_mobile
AllowTcpForwarding local
PermitOpen 127.0.0.1:8787
X11Forwarding no
AllowAgentForwarding no
MaxAuthTries 2
LoginGraceTime 20
```

Para chave publica, usar `authorized_keys` por dev/dispositivo e remover a linha quando revogar.

## Impacto de manutencao

Credencial embutida aumenta manutencao porque:

- rotacao normalmente exige rebuild;
- suporte precisa diagnosticar build, credencial, host e porta;
- revogacao acontece no servidor, nao no APK ja distribuido;
- builds antigos podem continuar funcionando ate a credencial ser revogada;
- cada dev precisa documentar onde esta sua propria chave ou senha.

Mesmo assim, para equipe interna de devs, esse custo pode ser aceitavel se o processo for explicito.
