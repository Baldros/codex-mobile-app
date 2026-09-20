<#
.SYNOPSIS
    Inicia o Codex Bridge na interface privada do WireGuard.

.DESCRIPTION
    Valida o endereco do tunnel, encerra uma instancia anterior do Bridge na
    mesma porta, compila o backend e inicia o servidor em primeiro plano.

.EXAMPLE
    .\scripts\start_codex_bridge.ps1

.EXAMPLE
    .\scripts\start_codex_bridge.ps1 -SkipBuild
#>
[CmdletBinding()]
param(
    [string]$TunnelName = "wg-codex",
    [string]$BindHost = "10.77.77.1",
    [ValidateRange(1, 65535)]
    [int]$Port = 8787,
    [ValidateSet("app-server", "sdk", "mock")]
    [string]$Runtime = "app-server",
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"

function Stop-ExistingBridge {
    param([int]$PortNumber)

    $connections = @(
        Get-NetTCPConnection -State Listen -LocalPort $PortNumber -ErrorAction SilentlyContinue
    )

    if ($connections.Count -eq 0) {
        return
    }

    $ownerPids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($ownerPid in $ownerPids) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid"
        $commandLine = [string]$process.CommandLine
        $isBridge =
            $process.Name -ieq "node.exe" -and
            ($commandLine -match "dist[\\/]server\.js" -or $commandLine -match "src[\\/]server\.ts")

        if (-not $isBridge) {
            throw "A porta $PortNumber esta ocupada pelo PID $ownerPid ($($process.Name)), que nao parece ser o Codex Bridge. Processo nao encerrado."
        }

        Write-Host "Encerrando Bridge anterior (PID $ownerPid)..." -ForegroundColor Yellow
        & taskkill.exe /PID ([string]$ownerPid) /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Nao foi possivel encerrar o Bridge anterior (PID $ownerPid)."
        }
    }

    $deadline = (Get-Date).AddSeconds(5)
    do {
        $remaining = Get-NetTCPConnection -State Listen -LocalPort $PortNumber -ErrorAction SilentlyContinue
        if ($null -eq $remaining) {
            return
        }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $deadline)

    throw "A porta $PortNumber continuou ocupada depois de encerrar o Bridge anterior."
}

if (-not (Test-Path -LiteralPath (Join-Path $BackendDir "package.json"))) {
    throw "Backend nao encontrado em $BackendDir."
}

$tunnelAddress = Get-NetIPAddress `
    -InterfaceAlias $TunnelName `
    -AddressFamily IPv4 `
    -ErrorAction SilentlyContinue |
    Where-Object IPAddress -eq $BindHost |
    Select-Object -First 1

if ($null -eq $tunnelAddress) {
    throw "O tunnel $TunnelName nao possui o endereco $BindHost. Ative o WireGuard antes de iniciar o Bridge."
}

Stop-ExistingBridge -PortNumber $Port

$previousEnvironment = @{
    NODE_ENV = $env:NODE_ENV
    CODEX_BRIDGE_HOST = $env:CODEX_BRIDGE_HOST
    CODEX_BRIDGE_PORT = $env:CODEX_BRIDGE_PORT
    CODEX_BRIDGE_RUNTIME = $env:CODEX_BRIDGE_RUNTIME
}

try {
    $env:NODE_ENV = "production"
    $env:CODEX_BRIDGE_HOST = $BindHost
    $env:CODEX_BRIDGE_PORT = [string]$Port
    $env:CODEX_BRIDGE_RUNTIME = $Runtime

    Push-Location $BackendDir
    try {
        if (-not $SkipBuild) {
            Write-Host "Compilando o backend..." -ForegroundColor Cyan
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) {
                throw "A compilacao do backend falhou com exit code $LASTEXITCODE."
            }
        }

        Write-Host "Iniciando Codex Bridge em http://${BindHost}:${Port} (runtime: $Runtime)..." -ForegroundColor Green
        Write-Host "Pressione Ctrl+C para encerrar." -ForegroundColor DarkGray
        & node dist/server.js
        $serverExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
} finally {
    foreach ($name in $previousEnvironment.Keys) {
        $value = $previousEnvironment[$name]
        if ($null -eq $value) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item "Env:$name" $value
        }
    }
}

if ($serverExitCode -ne 0) {
    throw "O Codex Bridge encerrou com exit code $serverExitCode."
}
