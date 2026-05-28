# Codex Mobile Android - build interno

Este playbook gera um APK Android standalone, instala no celular via USB e deixa o app pronto para usar o Codex Bridge pelo tunnel SSH.

Fluxo esperado:

```text
App Android
  -> http://127.0.0.1:18080 no proprio celular
  -> CodexSshTunnel nativo
  -> SSH codex_ssh@<endpoint>
  -> desktop 127.0.0.1:8787
```

`127.0.0.1:18080` e o localhost do celular. Se o campo Bridge do app mostrar um IP de Wi-Fi, o app esta usando configuracao antiga ou build/dev config errado.

## 1. Subir o Codex Bridge

Terminal 1, deixe rodando:

```powershell
cd E:\codex-mobile-app\backend
$env:CODEX_BRIDGE_RUNTIME = "app-server"
npm run build
npm run start
```

Validar em outro PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Esperado: `status=ok`, `codex_ready=true`, `active_transport=app-server`.

## 2. Validar SSH do Codex

O usuario SSH deste app e `codex_ssh`. Nao use usuario/chave de outro sistema.

Se ainda nao criou o usuario, siga [SSH_USER_SETUP_GUIDE.md](./SSH_USER_SETUP_GUIDE.md). O caminho padrao da chave deste playbook e:

```powershell
$KeyPath = "$env:USERPROFILE\.ssh\codex_mobile_rsa"
```

Use uma chave RSA 4096 em PEM para o APK Android. A chave ED25519 pode funcionar no `ssh.exe` do Windows, mas falhou no caminho Android/JSch deste app com desconexao `preauth`.

Criar chave, se necessario:

```powershell
ssh-keygen -t rsa -b 4096 -m PEM -f "$env:USERPROFILE\.ssh\codex_mobile_rsa" -C "codex-mobile-android-rsa"
```

Validar login local:

```powershell
ssh -i "$env:USERPROFILE\.ssh\codex_mobile_rsa" codex_ssh@127.0.0.1 -p 22
```

Validar ambiente local:

```powershell
cd E:\codex-mobile-app
.\scripts\validate_ssh_tunnel_ready.ps1 -SshPort 22 -PublicSshPort 39223
```

## 3. Preparar Android SDK e USB

Se voce ja tem JDK e Android SDK no PATH, pule esta parte. Caso contrario, este bloco tenta o SDK padrao do Android Studio e cai para o bundle portatil disponivel nesta maquina:

```powershell
$DefaultAndroidSdk = "$env:LOCALAPPDATA\Android\Sdk"
$PortableAndroidSdk = "E:\Atlas-Desktop-Agent\Mobile-Desktop-Agent\.android-sdk"
$PortableJdk = "E:\Atlas-Desktop-Agent\Mobile-Desktop-Agent\.jdk"

if (Test-Path "$DefaultAndroidSdk\platform-tools\adb.exe") {
  $env:ANDROID_HOME = $DefaultAndroidSdk
} elseif (Test-Path "$PortableAndroidSdk\platform-tools\adb.exe") {
  $env:ANDROID_HOME = $PortableAndroidSdk
}

if (-not (Get-Command java -ErrorAction SilentlyContinue) -and (Test-Path "$PortableJdk\bin\java.exe")) {
  $env:JAVA_HOME = $PortableJdk
}

$ToolPath = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
if ($env:JAVA_HOME) {
  $ToolPath = "$env:JAVA_HOME\bin;$ToolPath"
}
$env:Path = $ToolPath

adb version
java -version
```

Conecte o celular por USB, aceite a autorizacao de debug no aparelho e valide:

```powershell
adb devices
```

O aparelho precisa aparecer como `device`, nao `unauthorized`.

## 4. Configurar o build

Terminal 2, no mesmo PowerShell que vai rodar o build:

```powershell
cd E:\codex-mobile-app\mobile

Remove-Item Env:\EXPO_PUBLIC_BRIDGE_URL -ErrorAction SilentlyContinue

$KeyPath = "$env:USERPROFILE\.ssh\codex_mobile_rsa"
$DesktopLanIp = (Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
  Select-Object -First 1).IPv4Address.IPAddress
$PublicIpv4 = (Invoke-RestMethod "https://api.ipify.org?format=json").ip

$env:CODEX_MOBILE_GATEWAY = "ssh_tunnel"
$env:CODEX_MOBILE_API_BASE_URL = "http://127.0.0.1:18080"
$env:CODEX_MOBILE_SSH_TUNNEL_LOCAL_URL = "http://127.0.0.1:18080"
$env:CODEX_MOBILE_SSH_REMOTE_HOSTS = "${DesktopLanIp}:22,${PublicIpv4}:39223"
$env:CODEX_MOBILE_SSH_USERNAME = "codex_ssh"
$env:CODEX_MOBILE_SSH_AUTH_MODE = "private_key"
$env:CODEX_MOBILE_SSH_PRIVATE_KEY_PEM = Get-Content $KeyPath -Raw
$env:CODEX_MOBILE_SSH_REMOTE_API_HOST = "127.0.0.1"
$env:CODEX_MOBILE_SSH_REMOTE_API_PORT = "8787"
$env:CODEX_MOBILE_ALLOW_EMBEDDED_SSH_SECRET = "true"

$env:CODEX_MOBILE_SSH_REMOTE_HOSTS
```

Para 5G, `PublicIpv4:39223` precisa chegar ao desktop na porta local `22`:

```text
SEU_IPV4_PUBLICO:39223 -> desktop:22
```

Se a sua internet estiver em CGNAT ou a porta publica nao abrir, use IPv6 direto (`[SEU_IPV6]:22`) ou VPN/Tailscale como endpoint SSH.

## 5. Buildar, instalar e abrir

Este e o caminho de "build de verdade": release APK com bundle JS embutido, sem Metro.

```powershell
cd E:\codex-mobile-app\mobile
if (-not (Test-Path .\android\gradlew.bat)) {
  npx expo prebuild --platform android
}

adb devices

cd E:\codex-mobile-app\mobile\android

# Reset nativo antes do clean.
# O clean do Android/React Native pode falhar se app/.cxx apontar para codegen/autolinking
# gerado que ja foi removido por outros clean tasks.
$Workspace = (Resolve-Path "E:\codex-mobile-app").Path
$NativeResetTargets = @(
  "E:\codex-mobile-app\mobile\android\app\.cxx",
  "E:\codex-mobile-app\mobile\android\app\build\generated\autolinking"
)
foreach ($Target in $NativeResetTargets) {
  if (Test-Path -LiteralPath $Target) {
    $Resolved = (Resolve-Path -LiteralPath $Target).Path
    if (-not $Resolved.StartsWith($Workspace, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove outside workspace: $Resolved"
    }
    Remove-Item -LiteralPath $Resolved -Recurse -Force
  }
}

.\gradlew.bat clean --no-daemon --console=plain --stacktrace
.\gradlew.bat :app:createBundleReleaseJsAndAssets :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain --stacktrace

adb install -r .\app\build\outputs\apk\release\app-release.apk

adb shell monkey -p internal.codex.mobile -c android.intent.category.LAUNCHER 1
```

O APK gerado fica em:

```text
E:\codex-mobile-app\mobile\android\app\build\outputs\apk\release\app-release.apk
```

Se a instalacao falhar por assinatura incompativel, remova o app antigo e instale o APK novamente:

```powershell
adb uninstall internal.codex.mobile
adb install -r .\app\build\outputs\apk\release\app-release.apk
```

Para validar um estado completamente limpo no aparelho, rode antes da instalacao:

```powershell
adb shell pm clear internal.codex.mobile
```

Para gerar um APK multi-ABI distributavel, remova `-PreactNativeArchitectures=arm64-v8a`. O build demora mais porque compila `armeabi-v7a`, `arm64-v8a`, `x86` e `x86_64`.

O APK release precisa permitir cleartext para `http://127.0.0.1:18080`. Em projetos Android ja prebuildados, confirme que `mobile/android/app/src/main/AndroidManifest.xml` contem `android:usesCleartextTraffic="true"` no elemento `<application>`.

## 6. Conferir no app

Em Settings:

- `Bridge`: `http://127.0.0.1:18080`
- `Gateway`: `ssh_tunnel`
- `Local URL`: `http://127.0.0.1:18080`
- `Remote API`: `127.0.0.1:8787`
- `SSH endpoints`: LAN/publico/IPv6 configurados no build
- `SSH user`: `codex_ssh`
- `Config`: `ok`

Depois toque em refresh ou execute uma acao que chame o Bridge. O tunnel deve sair de `connecting` para `ready`.

## 7. Se apareceu IP de Wi-Fi

Corrija nesta ordem:

1. Confirme que `EXPO_PUBLIC_BRIDGE_URL` nao esta definido no terminal do build.
2. Confirme que `CODEX_MOBILE_API_BASE_URL` e `CODEX_MOBILE_SSH_TUNNEL_LOCAL_URL` estao em `http://127.0.0.1:18080`.
3. Limpe dados antes de instalar: `adb shell pm clear internal.codex.mobile`.
4. Rebuild com o fluxo da secao 5.

IP de Wi-Fi no terminal do Expo/Metro e normal em dev build, mas nao deve aparecer como URL do Bridge neste APK release.

## 8. Se `gradlew clean` falhar no CMake/autolinking

Sintoma comum:

```text
add_subdirectory given source ... android/build/generated/source/codegen/jni/ which is not an existing directory
```

Nao trate isso como erro de SSH. E estado nativo incremental antigo. Rode o bloco de reset nativo da secao 5 e depois repita:

```powershell
.\gradlew.bat clean --no-daemon --console=plain --stacktrace
```

## 9. Se nao conecta no 5G

Checklist rapido:

- desktop ligado, sem suspender;
- Codex Bridge respondendo em `http://127.0.0.1:8787/health`;
- `sshd` rodando no desktop;
- `codex_ssh` autentica com a chave;
- firewall do Windows permite OpenSSH Server;
- roteador encaminha `39223 -> desktop:22`, ou ha IPv6/VPN valido;
- app continua com Bridge `http://127.0.0.1:18080`.

No 5G, o Bridge nao muda para IP publico. O app continua falando com `127.0.0.1:18080`; quem muda e o endpoint SSH usado por baixo.

## 10. Fluxo dev, se precisar

`npx expo run:android` e fluxo de desenvolvimento. Ele pode depender do Metro e mostrar IP de LAN. Use apenas para iterar UI/codigo.

```powershell
cd E:\codex-mobile-app\mobile
adb reverse tcp:8081 tcp:8081
npx expo run:android
```

Para entregar um APK que o usuario abre e usa, use o fluxo release da secao 5.
