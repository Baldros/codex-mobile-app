# Codex Mobile - Build Guide

Interactive HTML documentation for building and installing **Codex Mobile**, an Android client that operates a local Codex CLI session on your desktop through a **secure SSH tunnel**, including on 5G.

The guide is organized as a **step-by-step path**: each page covers one build phase, with progress checklists, copyable code blocks, light/dark theme switching, and sidebar navigation. The goal is to keep the end-to-end process organized so you do not get lost between terminals, variables, and the device.

> **GitHub does not render HTML.** If you click the files below in the repository, you will see the raw source code, which is not convenient to follow.
> To view the guide as intended, styled and interactive, **download/clone the repository and open `build-guide/index.html` in your browser**. Double-clicking the file is enough; no server is required.

---

## Documentation Structure

Open `index.html` and follow the path in order, or jump directly to what you need:

| # | Page | What it covers |
|---|------|----------------|
| * | [`index.html`](index.html) | Overview, conventions, **Admin x regular terminal** table, and progress checklist |
| 1 | [`01-architecture.html`](01-architecture.html) | Architecture decisions: why SSH tunnel, trust boundary, transport, and SSE streaming |
| 2 | [`02-prerequisites.html`](02-prerequisites.html) | Node.js, JDK 17, Android SDK, OpenSSH, and the device in debugging mode |
| 3 | [`03-ssh-setup.html`](03-ssh-setup.html) | Dedicated user, key generation, `authorized_keys`, and `sshd` hardening |
| 4 | [`04-build-run.html`](04-build-run.html) | Start the bridge, configure variables, generate the release APK, and install via USB |
| 5 | [`05-security.html`](05-security.html) | Embedded credential, environment variables, rotation, and repository rules |
| 6 | [`06-troubleshooting.html`](06-troubleshooting.html) | Common SSH, build, and 5G connection errors, with cause and fix |

Support files: `styles.css` (theme and OpenAI-inspired palette) and `app.js` (interactions: copy, tabs, checklists, scrollspy).

---

## The Build in 1 Minute

A quick summary of the full path, so you know what you are getting into before downloading.

### The Idea

The mobile app is only an **operations client**. Everything sensitive, including the Codex CLI, OpenAI login, workspace, and permissions, stays on the **desktop**, which is the trust boundary. The phone talks to a local **Codex Bridge**, and **the only service reachable from outside is SSH**. The bridge is never published to the internet; HTTP traffic travels through `127.0.0.1` at both ends of the tunnel.

### You Will Need (on the Windows Desktop)

- **Node.js** 20 LTS+ · **JDK 17** · **Android SDK** (command-line tools) · **OpenSSH** (client + server)
- An **Android device** with USB debugging enabled

### The Path, Step by Step

1. **Bridge running** - start Codex Bridge, bound to loopback, and confirm `/health`.
2. **SSH tunnel** - create a dedicated user, generate one key per device, and lock down `sshd` so forwarding only reaches the bridge.
3. **Build variables** - define `CODEX_MOBILE_*` in the environment; the key is **read from a file**, never pasted into code.
4. **Native project** - `npm install` + `expo prebuild`.
5. **Release APK** - `gradlew assembleRelease` with the JS bundle embedded (no Metro).
6. **Install and open** - `adb install` and launch the app.
7. **Validate the tunnel** - confirm it moves from `connecting` to `ready`, including outside Wi-Fi.

### Regular Terminal x Administrator

The **build itself does not require Administrator**. Node, npm, Expo, Gradle, and `adb` run in a regular terminal. What requires **Admin** is the one-time system setup: installing OpenSSH Server, creating the SSH user, adjusting `sshd_config`/permissions, and machine-level variables.

### Security Highlights

- Any credential embedded in the APK is **recoverable**. Use a **dedicated, unprivileged SSH user**, restrict `PermitOpen` to the bridge loopback, and use a **per-device key** that can be revoked.
- **Never** commit `.env`, keys, or passwords. Use **environment variables** and treat logs as sensitive.

---

## How to Open the Guide

```bash
git clone <repo>
cd <repo>/build-guide
# open index.html in your browser (double-click works)
```

Works offline directly through `file://`: no build, no dependencies, no server.

---

<sub>Internal engineering document. Commands use placeholders (`<...>`) and environment variables instead of real values. Do not distribute the APK, private key, or build variables outside the team.</sub>
