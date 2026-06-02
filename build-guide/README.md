# Codex Mobile · Guia de Build

Documentação interativa, em HTML, para compilar e instalar o **Codex Mobile** — um cliente Android que opera uma sessão local do Codex CLI no seu desktop, conversando com ela por um **túnel SSH seguro**, inclusive em 5G.

O guia foi pensado como uma **trilha em etapas**: cada página cobre uma fase do build, com checklists de progresso, blocos de código com botão de copiar, alternância de tema claro/escuro e navegação lateral. A ideia é organizar o processo de ponta a ponta, sem você se perder entre terminais, variáveis e o aparelho.

> ⚠️ **O GitHub não renderiza HTML.** Clicando nos arquivos abaixo aqui no repositório, você verá o código-fonte cru — nada convidativo e difícil de seguir.
> Para ver o guia como ele foi feito (estilizado e interativo), **baixe/clone o repositório e abra `build-guide/index.html` no navegador**. É só dar duplo-clique no arquivo — não precisa de servidor.

---

## 📚 Estrutura da documentação

Abra pelo `index.html` e siga a trilha na ordem, ou pule direto para o que precisa:

| # | Página | O que cobre |
|---|--------|-------------|
| ★ | [`index.html`](index.html) | Visão geral, convenções, tabela **Admin × Terminal comum** e checklist de progresso |
| 1 | [`01-architecture.html`](01-architecture.html) | Decisões de arquitetura: por que túnel SSH, fronteira de confiança, transporte e streaming SSE |
| 2 | [`02-prerequisites.html`](02-prerequisites.html) | Node.js, JDK 17, Android SDK, OpenSSH e o aparelho em modo de depuração |
| 3 | [`03-ssh-setup.html`](03-ssh-setup.html) | Usuário dedicado, geração de chave, `authorized_keys` e hardening do `sshd` |
| 4 | [`04-build-run.html`](04-build-run.html) | Subir o bridge, configurar variáveis, gerar o APK release e instalar via USB |
| 5 | [`05-security.html`](05-security.html) | Credencial embutida, variáveis de ambiente, rotação e regras de repositório |
| 6 | [`06-troubleshooting.html`](06-troubleshooting.html) | Erros comuns de SSH, build e conexão em 5G — com causa e correção |

Arquivos de apoio: `styles.css` (tema, paleta inspirada na OpenAI) e `app.js` (interações — cópia, abas, checklists, scrollspy).

---

## ⏱️ O build em 1 minuto

Um resumo do caminho completo, para você saber no que está entrando antes de baixar.

### A ideia

O app mobile é só um **cliente de operação**. Tudo que é sensível — Codex CLI, login OpenAI, workspace, permissões — fica no **desktop**, que é a fronteira de confiança. O celular fala com um **Codex Bridge** local, e **o único serviço alcançável de fora é o SSH**. O bridge nunca é publicado na internet; o tráfego HTTP trafega por `127.0.0.1` nas duas pontas do túnel.

### Você vai precisar (no desktop Windows)

- **Node.js** 20 LTS+ · **JDK 17** · **Android SDK** (command-line tools) · **OpenSSH** (cliente + servidor)
- Um **aparelho Android** com depuração USB ativada

### O caminho, em etapas

1. **Bridge no ar** — subir o Codex Bridge, preso ao loopback, e confirmar o `/health`.
2. **Túnel SSH** — criar um usuário dedicado, gerar uma chave por dispositivo e trancar o `sshd` (forward só para o bridge).
3. **Variáveis de build** — definir as `CODEX_MOBILE_*` no ambiente; a chave é **lida de arquivo**, nunca colada no código.
4. **Projeto nativo** — `npm install` + `expo prebuild`.
5. **APK release** — `gradlew assembleRelease` com o bundle JS embutido (sem Metro).
6. **Instalar e abrir** — `adb install` e iniciar o app.
7. **Validar o túnel** — confirmar que ele sai de `connecting` para `ready`, inclusive fora do Wi-Fi.

### Terminal comum × Administrador

O **build em si não exige Administrador** — Node, npm, Expo, Gradle e `adb` rodam num terminal comum. O que pede **Admin** é a *preparação única do sistema*: instalar o OpenSSH Server, criar o usuário SSH, ajustar `sshd_config`/permissões e variáveis de máquina.

### Segurança em destaque

- Qualquer credencial embutida no APK é **recuperável** — por isso: usuário SSH **dedicado e sem privilégios**, `PermitOpen` restrito ao loopback do bridge e **chave por dispositivo** (revogável).
- **Nunca** commitar `.env`, chaves ou senhas. Use **variáveis de ambiente** e trate logs como sensíveis.

---

## 🚀 Como abrir o guia

```bash
git clone <repo>
cd <repo>/build-guide
# abra index.html no navegador (duplo-clique já funciona)
```

Funciona offline, direto via `file://` — sem build, sem dependências, sem servidor.

---

<sub>Documento interno de engenharia. Os comandos usam *placeholders* (`<...>`) e variáveis de ambiente em vez de valores reais. Não distribua o APK, a chave privada ou as variáveis de build fora da equipe.</sub>
