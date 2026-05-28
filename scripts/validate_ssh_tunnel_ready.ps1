param(
    [string]$ApiHost = "127.0.0.1",
    [int]$ApiPort = 8787,
    [int]$SshPort = 22,
    [int]$PublicSshPort = 0,
    [switch]$SkipBridgeHealth
)

$ErrorActionPreference = "Stop"
$failures = New-Object System.Collections.Generic.List[string]

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "== $Title =="
}

function Add-Failure {
    param([string]$Message)
    $script:failures.Add($Message) | Out-Null
    Write-Host "FAIL: $Message" -ForegroundColor Red
}

function Add-Ok {
    param([string]$Message)
    Write-Host "OK: $Message" -ForegroundColor Green
}

function Add-Warn {
    param([string]$Message)
    Write-Host "WARN: $Message" -ForegroundColor Yellow
}

Write-Section "Codex"

$codexCommand = Get-Command codex -ErrorAction SilentlyContinue
if ($null -eq $codexCommand) {
    Add-Failure "Codex CLI nao encontrado no PATH."
} else {
    Add-Ok "Codex CLI encontrado em $($codexCommand.Source)."
    try {
        $codexVersion = & codex --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $codexVersion) {
            Add-Ok "Versao: $codexVersion"
        } else {
            Add-Warn "Nao foi possivel ler a versao do Codex CLI."
        }
    } catch {
        Add-Warn "Falha ao executar codex --version: $($_.Exception.Message)"
    }
}

Write-Section "SSH client"

$sshCommand = Get-Command ssh -ErrorAction SilentlyContinue
if ($null -eq $sshCommand) {
    Add-Failure "Cliente ssh nao encontrado no PATH."
} else {
    Add-Ok "Cliente ssh encontrado em $($sshCommand.Source)."
}

Write-Section "OpenSSH Server"

$sshdService = Get-Service -Name sshd -ErrorAction SilentlyContinue
if ($null -eq $sshdService) {
    Add-Failure "Servico sshd nao encontrado. Instale OpenSSH Server."
} elseif ($sshdService.Status -ne "Running") {
    Add-Failure "Servico sshd existe mas nao esta rodando. Status: $($sshdService.Status)."
} else {
    Add-Ok "Servico sshd rodando."
}

Write-Section "Portas locais"

$sshListening = Get-NetTCPConnection -LocalPort $SshPort -State Listen -ErrorAction SilentlyContinue
if ($null -eq $sshListening) {
    Add-Failure "Nenhum listener local encontrado na porta SSH $SshPort."
} else {
    Add-Ok "Porta SSH $SshPort esta em LISTEN."
}

$apiListening = Get-NetTCPConnection -LocalAddress $ApiHost -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
if ($null -eq $apiListening) {
    if ($SkipBridgeHealth) {
        Add-Warn "Bridge nao esta em LISTEN em ${ApiHost}:${ApiPort}, mas -SkipBridgeHealth foi usado."
    } else {
        Add-Failure "Bridge nao esta em LISTEN em ${ApiHost}:${ApiPort}."
    }
} else {
    Add-Ok "Bridge parece estar em LISTEN em ${ApiHost}:${ApiPort}."
}

Write-Section "Bridge health"

if ($SkipBridgeHealth) {
    Add-Warn "Health do bridge ignorado por parametro."
} else {
    $healthUrl = "http://${ApiHost}:${ApiPort}/health"
    $healthOk = $false

    for ($i = 1; $i -le 6; $i++) {
        try {
            $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
            Add-Ok "$healthUrl respondeu."
            $response | ConvertTo-Json -Depth 5
            $healthOk = $true
            break
        } catch {
            Add-Warn "Tentativa $i falhou em ${healthUrl}: $($_.Exception.Message)"
            Start-Sleep -Seconds 1
        }
    }

    if (-not $healthOk) {
        Add-Failure "Bridge health nao respondeu em $healthUrl."
    }
}

Write-Section "IP publico"

try {
    $publicIp = Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 5
    Add-Ok "IP publico observado: $($publicIp.ip)"
} catch {
    Add-Warn "Nao foi possivel obter IP publico: $($_.Exception.Message)"
}

Write-Section "Checklist mobile 5G"

$publicPortLabel = if ($PublicSshPort -gt 0) { $PublicSshPort } else { $SshPort }
Write-Host "- Bridge no desktop: http://${ApiHost}:${ApiPort}/health"
Write-Host "- Tunnel no mobile: http://127.0.0.1:18080/health"
Write-Host "- SSH publico deve encaminhar porta $publicPortLabel para esta maquina na porta $SshPort."
Write-Host "- Hardening futuro: sshd_config pode restringir PermitOpen ${ApiHost}:${ApiPort}."
Write-Host "- Teste final deve ser feito com o celular fora do Wi-Fi."

Write-Section "Resultado"

if ($failures.Count -gt 0) {
    Write-Host "Falhas encontradas:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "- $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Ambiente local pronto para validacao do tunnel." -ForegroundColor Green
