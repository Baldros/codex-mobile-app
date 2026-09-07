<#
.SYNOPSIS
    Valida o ambiente local do Codex Mobile sobre WireGuard.

.DESCRIPTION
    Checa Codex CLI, servico do tunnel WireGuard, interface, listener UDP,
    bind do Codex Bridge e health da API.

    Nao exibe nem le chave privada. As checagens que exigem elevacao
    (wg show) sao marcadas como WARN quando o terminal nao e Administrador,
    nunca como falha.

.EXAMPLE
    .\scripts\validate_wireguard_ready.ps1

.EXAMPLE
    .\scripts\validate_wireguard_ready.ps1 -SkipBridgeHealth

.EXAMPLE
    .\scripts\validate_wireguard_ready.ps1 -PeerAddress 10.77.77.2
#>
param(
    [string]$TunnelName = "wg-codex",
    [string]$ApiHost = "10.77.77.1",
    [int]$ApiPort = 8787,
    [int]$ListenPort = 51821,
    [string]$PeerAddress = "10.77.77.2",
    [switch]$SkipBridgeHealth,
    [switch]$SkipPeerPing
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

function Test-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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

Write-Section "WireGuard"

$wgExe = "C:\Program Files\WireGuard\wg.exe"
if (-not (Test-Path -LiteralPath $wgExe)) {
    Add-Failure "wg.exe nao encontrado em $wgExe. Instale com: winget install --id WireGuard.WireGuard -e"
} else {
    Add-Ok "wg.exe encontrado."
    try {
        $wgVersion = & $wgExe --version 2>$null
        if ($wgVersion) { Add-Ok "Versao: $wgVersion" }
    } catch {
        Add-Warn "Falha ao executar wg --version: $($_.Exception.Message)"
    }
}

$serviceName = "WireGuardTunnel`$$TunnelName"
$tunnelService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($null -eq $tunnelService) {
    Add-Failure "Servico $serviceName nao encontrado. Importe o tunnel na GUI do WireGuard."
} elseif ($tunnelService.Status -ne "Running") {
    Add-Failure "Servico $serviceName existe mas nao esta rodando. Status: $($tunnelService.Status)."
} else {
    Add-Ok "Servico $serviceName rodando."
    if ($tunnelService.StartType -ne "Automatic") {
        Add-Warn "StartType e $($tunnelService.StartType). Para persistir entre reboots, use (como Admin): Set-Service -Name '$serviceName' -StartupType Automatic"
    } else {
        Add-Ok "StartType Automatic: o tunnel sobe sozinho apos reboot."
    }
}

Write-Section "Interface do tunnel"

$tunnelIp = Get-NetIPAddress -InterfaceAlias $TunnelName -AddressFamily IPv4 -ErrorAction SilentlyContinue
if ($null -eq $tunnelIp) {
    Add-Failure "Interface $TunnelName sem endereco IPv4. O tunnel esta ativo?"
} elseif ($tunnelIp.IPAddress -ne $ApiHost) {
    Add-Failure "Interface $TunnelName esta em $($tunnelIp.IPAddress), esperado $ApiHost."
} else {
    Add-Ok "Interface $TunnelName em $($tunnelIp.IPAddress)/$($tunnelIp.PrefixLength)."
}

Write-Section "Listener UDP $ListenPort"

$udpEndpoints = Get-NetUDPEndpoint -LocalPort $ListenPort -ErrorAction SilentlyContinue
if ($null -eq $udpEndpoints) {
    Add-Failure "Nenhum listener UDP na porta $ListenPort."
} else {
    $addresses = @($udpEndpoints | Select-Object -ExpandProperty LocalAddress)
    Add-Ok "UDP $ListenPort escutando em: $($addresses -join ', ')"
    if ($addresses -notcontains "::") {
        Add-Warn "Sem listener em '::'. O endpoint IPv6 e o unico caminho para 5G sob CGNAT."
    }
}

Write-Section "Handshake dos peers"

if (-not (Test-Path -LiteralPath $wgExe)) {
    Add-Warn "wg.exe ausente; handshake nao verificado."
} elseif (-not (Test-IsElevated)) {
    Add-Warn "Terminal sem elevacao: 'wg show' exige Administrador. Isso nao indica falha do tunnel."
} else {
    try {
        $wgShow = & $wgExe show $TunnelName 2>&1
        if ($LASTEXITCODE -eq 0) {
            $peerLines = @($wgShow | Select-String -Pattern "latest handshake")
            if ($peerLines.Count -eq 0) {
                Add-Warn "Nenhum handshake registrado. Ative o tunnel no aparelho."
            } else {
                foreach ($line in $peerLines) {
                    Add-Ok ("Handshake: " + $line.ToString().Trim())
                }
            }
        } else {
            Add-Warn "wg show retornou: $wgShow"
        }
    } catch {
        Add-Warn "Falha ao executar wg show: $($_.Exception.Message)"
    }
}

Write-Section "Alcance do peer"

if ($SkipPeerPing) {
    Add-Warn "Ping ao peer ignorado por parametro."
} else {
    try {
        if (Test-Connection -ComputerName $PeerAddress -Count 2 -Quiet -ErrorAction Stop) {
            Add-Ok "$PeerAddress respondeu ao ping."
        } else {
            Add-Warn "$PeerAddress nao respondeu. O tunnel pode estar inativo no aparelho, ou o Android pode estar bloqueando ICMP."
        }
    } catch {
        Add-Warn "Falha no ping a ${PeerAddress}: $($_.Exception.Message)"
    }
}

Write-Section "Bind do Codex Bridge"

$apiListening = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue
if ($null -eq $apiListening) {
    if ($SkipBridgeHealth) {
        Add-Warn "Bridge nao esta em LISTEN na porta $ApiPort, mas -SkipBridgeHealth foi usado."
    } else {
        Add-Failure "Bridge nao esta em LISTEN na porta $ApiPort."
    }
} else {
    $boundAddresses = @($apiListening | Select-Object -ExpandProperty LocalAddress | Sort-Object -Unique)
    foreach ($address in $boundAddresses) {
        if ($address -eq "0.0.0.0" -or $address -eq "::") {
            Add-Failure "Bridge escutando em $address. Isso expoe a API na LAN. Defina CODEX_BRIDGE_HOST=$ApiHost."
        } elseif ($address -eq $ApiHost) {
            Add-Ok "Bridge escutando somente em ${address}:${ApiPort}."
        } else {
            Add-Warn "Bridge escutando em ${address}:${ApiPort}, esperado $ApiHost."
        }
    }
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

Write-Section "Endpoint IPv6 para 5G"

$stable = Get-NetIPAddress -AddressFamily IPv6 -ErrorAction SilentlyContinue |
    Where-Object { $_.PrefixOrigin -eq 'RouterAdvertisement' -and $_.SuffixOrigin -eq 'Link' } |
    Select-Object -First 1

if ($null -eq $stable) {
    Add-Warn "Nenhum IPv6 global estavel encontrado. Sem ele nao ha endpoint para 5G sob CGNAT."
} else {
    Add-Ok "IPv6 estavel presente na interface $($stable.InterfaceAlias) (SuffixOrigin Link)."
    Write-Host "  Use este endereco como Endpoint no peer do aparelho, no formato [IPv6]:$ListenPort."
    Write-Host "  O endereco nao e exibido aqui de proposito. Consulte com:" -ForegroundColor DarkGray
    Write-Host "    Get-NetIPAddress -AddressFamily IPv6 | Where-Object SuffixOrigin -eq 'Link'" -ForegroundColor DarkGray
}

$temporary = Get-NetIPAddress -AddressFamily IPv6 -ErrorAction SilentlyContinue |
    Where-Object { $_.PrefixOrigin -eq 'RouterAdvertisement' -and $_.SuffixOrigin -eq 'Random' }

if ($temporary) {
    Add-Warn "Existe tambem um IPv6 temporario (SuffixOrigin Random). Ele rotaciona: nao use como Endpoint e nao publique via DDNS automatico."
}

Write-Section "Legado SSH"

$sshdService = Get-Service -Name sshd -ErrorAction SilentlyContinue
if ($null -eq $sshdService) {
    Add-Ok "sshd nao instalado."
} elseif ($sshdService.Status -eq "Running") {
    Add-Warn "sshd esta rodando. O Codex Mobile nao usa mais SSH. Se o Atlas tambem nao usar, desligue: Stop-Service sshd; Set-Service sshd -StartupType Disabled"
    Add-Warn "Enquanto a chave antiga estiver em authorized_keys, APKs antigos continuam com acesso. Ver F-05 em docs/SECURITY_POSTURE.md."
} else {
    Add-Ok "sshd instalado mas parado."
}

Write-Section "Checklist mobile"

Write-Host "- URL do Bridge no app: http://${ApiHost}:${ApiPort}"
Write-Host "- Gateway do build: http"
Write-Host "- Allowed IPs no aparelho: ${ApiHost}/32 (somente o host, nunca 0.0.0.0/0)"
Write-Host "- Persistent keepalive: 25"
Write-Host "- Endpoint em Wi-Fi: IP de LAN deste desktop na porta $ListenPort"
Write-Host "- Endpoint em 5G: [IPv6 estavel]:$ListenPort ou nome de DDNS"
Write-Host "- Teste final deve ser feito com o celular fora do Wi-Fi."

Write-Section "Resultado"

if ($failures.Count -gt 0) {
    Write-Host "Falhas encontradas:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "- $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Ambiente WireGuard pronto." -ForegroundColor Green
exit 0
