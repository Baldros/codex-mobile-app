param(
  [string]$Workspace = "",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 18787,
  [int]$TimeoutSeconds = 90,
  [switch]$SkipBuild,
  [switch]$KeepServer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$BackendDir = Join-Path $RepoRoot "backend"
if ([string]::IsNullOrWhiteSpace($Workspace)) {
  $Workspace = $RepoRoot
}
$WorkspacePath = (Resolve-Path -LiteralPath $Workspace).Path
$BaseUri = "http://${HostName}:${Port}"
$LogDir = Join-Path $BackendDir "logs"
$StdoutLog = Join-Path $LogDir "smoke-app-server-bridge.out.log"
$StderrLog = Join-Path $LogDir "smoke-app-server-bridge.err.log"
$AllowlistFile = Join-Path ([System.IO.Path]::GetTempPath()) ("codex-mobile-bridge-smoke-{0}.allowlist" -f $PID)
$ServerProcess = $null

function Write-Step {
  param([string]$Message)
  Write-Host "[smoke] $Message"
}

function Get-ListeningProcessOnPort {
  param([string]$Address, [int]$PortNumber)

  try {
    return @(Get-NetTCPConnection -LocalAddress $Address -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return @()
  }
}

function Read-LogTail {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  return (Get-Content -LiteralPath $Path -Tail 80 | Out-String)
}

function Normalize-PathForCompare {
  param([string]$PathValue)

  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd("\", "/")
}

function Assert-SamePath {
  param([string]$Actual, [string]$Expected, [string]$Label)

  $ActualNormalized = Normalize-PathForCompare $Actual
  $ExpectedNormalized = Normalize-PathForCompare $Expected
  if (-not [string]::Equals($ActualNormalized, $ExpectedNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "${Label} mismatch. Expected '$ExpectedNormalized', got '$ActualNormalized'."
  }
}

function Invoke-BridgeJson {
  param(
    [ValidateSet("GET", "POST")]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )

  $Uri = "$BaseUri$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Uri $Uri -Method $Method -TimeoutSec $TimeoutSeconds
  }

  $Json = $Body | ConvertTo-Json -Depth 12 -Compress
  return Invoke-RestMethod -Uri $Uri -Method $Method -ContentType "application/json" -Body $Json -TimeoutSec $TimeoutSeconds
}

function ConvertFrom-SseContent {
  param([string]$Content)

  $Events = @()
  $Blocks = [regex]::Split($Content.Trim(), "(?:\r?\n){2,}") | Where-Object { $_.Trim().Length -gt 0 }
  foreach ($Block in $Blocks) {
    $EventName = "message"
    $DataLines = @()

    foreach ($Line in [regex]::Split($Block, "\r?\n")) {
      if ($Line.StartsWith("event:")) {
        $EventName = $Line.Substring(6).Trim()
      } elseif ($Line.StartsWith("data:")) {
        $DataLines += $Line.Substring(5).TrimStart()
      }
    }

    $DataText = $DataLines -join "`n"
    $Data = $null
    if ($DataText.Length -gt 0) {
      try {
        $Data = $DataText | ConvertFrom-Json
      } catch {
        $Data = $DataText
      }
    }

    $Events += [pscustomobject]@{
      event = $EventName
      data = $Data
      raw = $Block
    }
  }

  return $Events
}

function Invoke-BridgeSsePost {
  param([string]$Path, [string]$JsonBody)

  $Client = [System.Net.Http.HttpClient]::new()
  $Client.Timeout = [TimeSpan]::FromSeconds($TimeoutSeconds)
  try {
    $Content = [System.Net.Http.StringContent]::new($JsonBody, [System.Text.Encoding]::UTF8, "application/json")
    $Response = $Client.PostAsync("$BaseUri$Path", $Content).GetAwaiter().GetResult()
    $Body = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $Response.IsSuccessStatusCode) {
      throw "SSE POST failed with status $([int]$Response.StatusCode): $Body"
    }

    return $Body
  } finally {
    $Client.Dispose()
  }
}

function Wait-ForBridgeHealth {
  $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $LastError = $null

  while ((Get-Date) -lt $Deadline) {
    if ($null -ne $ServerProcess -and $ServerProcess.HasExited) {
      $Stdout = Read-LogTail $StdoutLog
      $Stderr = Read-LogTail $StderrLog
      throw "Bridge exited before becoming healthy. stdout:`n$Stdout`nstderr:`n$Stderr"
    }

    try {
      $Health = Invoke-BridgeJson -Method GET -Path "/health"
      if ($Health.active_transport -eq "app-server" -and $Health.codex_ready -eq $true) {
        return $Health
      }

      $LastError = "health returned active_transport=$($Health.active_transport), codex_ready=$($Health.codex_ready)"
    } catch {
      $LastError = $_.Exception.Message
    }

    Start-Sleep -Milliseconds 500
  }

  throw "Bridge did not become healthy within ${TimeoutSeconds}s. Last error: $LastError"
}

function Assert-SessionMetadata {
  param([object]$Thread)

  if (-not $Thread.path) {
    throw "Thread response did not include a native Codex session path."
  }

  $SessionPath = [string]$Thread.path
  if (-not (Test-Path -LiteralPath $SessionPath)) {
    throw "Native Codex session file was not found: $SessionPath"
  }

  $FirstLine = Get-Content -LiteralPath $SessionPath -TotalCount 1 | ConvertFrom-Json
  if ($FirstLine.type -ne "session_meta") {
    throw "First native session event is not session_meta: $SessionPath"
  }

  Assert-SamePath -Actual ([string]$FirstLine.payload.cwd) -Expected $WorkspacePath -Label "session_meta.cwd"
}

$PreviousEnv = @{
  CODEX_BRIDGE_HOST = $env:CODEX_BRIDGE_HOST
  CODEX_BRIDGE_PORT = $env:CODEX_BRIDGE_PORT
  CODEX_BRIDGE_RUNTIME = $env:CODEX_BRIDGE_RUNTIME
  CODEX_BRIDGE_WORKSPACE_ALLOWLIST = $env:CODEX_BRIDGE_WORKSPACE_ALLOWLIST
  CODEX_BRIDGE_WORKSPACE_ALLOWLIST_FILE = $env:CODEX_BRIDGE_WORKSPACE_ALLOWLIST_FILE
  CODEX_BRIDGE_SKIP_GIT_REPO_CHECK = $env:CODEX_BRIDGE_SKIP_GIT_REPO_CHECK
}

try {
  $Connections = @(Get-ListeningProcessOnPort -Address $HostName -PortNumber $Port)
  if ($Connections.Count -gt 0) {
    $Owners = $Connections | ForEach-Object {
      $Process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      if ($null -eq $Process) {
        "PID $($_.OwningProcess)"
      } else {
        "PID $($_.OwningProcess) $($Process.ProcessName)"
      }
    }
    throw "Port ${HostName}:${Port} is already in use by $($Owners -join ', '). Use -Port with a free port or stop the existing process."
  }

  if (-not $SkipBuild) {
    Write-Step "building backend"
    Push-Location $BackendDir
    try {
      & npm.cmd run build
      if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
  }

  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
  Set-Content -LiteralPath $AllowlistFile -Value $WorkspacePath -Encoding UTF8

  $env:CODEX_BRIDGE_HOST = $HostName
  $env:CODEX_BRIDGE_PORT = [string]$Port
  $env:CODEX_BRIDGE_RUNTIME = "app-server"
  $env:CODEX_BRIDGE_WORKSPACE_ALLOWLIST = $WorkspacePath
  $env:CODEX_BRIDGE_WORKSPACE_ALLOWLIST_FILE = $AllowlistFile
  $env:CODEX_BRIDGE_SKIP_GIT_REPO_CHECK = "false"

  Write-Step "starting bridge on $BaseUri"
  $ServerProcess = Start-Process `
    -FilePath "node" `
    -ArgumentList "dist/server.js" `
    -WorkingDirectory $BackendDir `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -WindowStyle Hidden `
    -PassThru

  $Health = Wait-ForBridgeHealth
  Write-Step "health ok: runtime=$($Health.active_transport), cli=$($Health.codex_cli_version)"

  $Title = "Smoke app-server bridge $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  $CreateResponse = Invoke-BridgeJson -Method POST -Path "/v1/threads" -Body @{
    title = $Title
    workspace = $WorkspacePath
  }
  $Thread = $CreateResponse.thread
  if (-not $Thread.id) {
    throw "Thread creation did not return a thread id."
  }
  Assert-SamePath -Actual ([string]$Thread.cwd) -Expected $WorkspacePath -Label "thread.cwd"
  Write-Step "created thread $($Thread.id)"

  $RunBody = @{
    message = "Smoke test do Codex Mobile Bridge via app-server. Nao modifique arquivos nem execute comandos. Responda apenas: smoke app-server ok."
    cwd = $WorkspacePath
    approval_policy = "never"
    sandbox_mode = "read-only"
    network_access_enabled = $false
  }
  $RunJson = $RunBody | ConvertTo-Json -Depth 12 -Compress
  $SseContent = Invoke-BridgeSsePost -Path "/v1/threads/$($Thread.id)/runs/stream" -JsonBody $RunJson
  $Events = @(ConvertFrom-SseContent -Content $SseContent)

  $DoneEvents = @($Events | Where-Object { $_.event -eq "done" })
  if ($DoneEvents.Count -eq 0) {
    throw "Run stream did not emit a done event."
  }

  $Done = $DoneEvents[-1]
  if ($Done.data.status -ne "completed") {
    throw "Run did not complete successfully. Status: $($Done.data.status)"
  }

  $AgentMessages = @($Events | Where-Object { $_.event -eq "agent_message" })
  if ($AgentMessages.Count -eq 0) {
    throw "Run stream did not emit a final agent_message event."
  }
  $FinalMessage = [string]$AgentMessages[-1].data.text
  Write-Step "agent response: $FinalMessage"

  $EncodedWorkspace = [System.Uri]::EscapeDataString($WorkspacePath)
  $ListResponse = Invoke-BridgeJson -Method GET -Path "/v1/threads?limit=10&cwd=$EncodedWorkspace"
  $ListedThread = @($ListResponse.data | Where-Object { $_.id -eq $Thread.id })[0]
  if ($null -eq $ListedThread) {
    throw "Created thread was not returned by /v1/threads filtered by cwd."
  }
  Assert-SamePath -Actual ([string]$ListedThread.cwd) -Expected $WorkspacePath -Label "listed_thread.cwd"
  Assert-SessionMetadata -Thread $ListedThread

  Write-Host ""
  Write-Host "SMOKE OK"
  Write-Host "Bridge: $BaseUri"
  Write-Host "Thread: $($Thread.id)"
  Write-Host "Workspace: $WorkspacePath"
  Write-Host "Session: $($ListedThread.path)"
} finally {
  if ($null -ne $ServerProcess -and -not $ServerProcess.HasExited -and -not $KeepServer) {
    Write-Step "stopping bridge PID $($ServerProcess.Id)"
    Stop-Process -Id $ServerProcess.Id -Force
  }

  if (Test-Path -LiteralPath $AllowlistFile) {
    Remove-Item -LiteralPath $AllowlistFile -Force
  }

  foreach ($Name in $PreviousEnv.Keys) {
    if ($null -eq $PreviousEnv[$Name]) {
      Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:$Name" $PreviousEnv[$Name]
    }
  }
}
