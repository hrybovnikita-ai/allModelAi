param(
    [ValidateSet('start', 'stop', 'status')][string]$Action = 'start',
    [ValidateRange(1024, 65535)][int]$Port = 5055,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $projectRoot '.runtime'
$stateFile = Join-Path $runtimeDir 'home-server.json'
$serverFile = Join-Path $projectRoot 'backend\server.js'

function Get-HomeServer {
    if (!(Test-Path -LiteralPath $stateFile)) { return $null }
    $saved = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $running = Get-CimInstance Win32_Process -Filter "ProcessId = $($saved.processId)"
    if (!$running -or $running.Name -ne 'node.exe' -or
        !$running.CommandLine.Contains($serverFile) -or
        $running.CreationDate.ToUniversalTime().ToString('o') -ne $saved.createdAt) { return $null }
    return $saved
}
function Show-Addresses([int]$ServerPort) {
    $lines = @('AllModelAI home server', '', "On this computer: http://localhost:$ServerPort/chat", '', 'On your phone or tablet, connect to the same home Wi-Fi and open:')
    $addresses = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
        ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object { $_ -and $_ -notlike '169.254.*' } | Sort-Object -Unique
    foreach ($address in $addresses) { $lines += "http://${address}:$ServerPort/chat" }
    if (!$addresses) { $lines += 'No home network address found. Connect to Wi-Fi or Ethernet and run again.' }
    $lines += @('', 'The editor and this window can be closed. Keep the computer awake and online.', 'To stop: double-click stop-home-server.bat.', 'Connection help: HOME-WIFI.md')
    $lines | Set-Content -LiteralPath (Join-Path $projectRoot 'HOME-ACCESS.txt') -Encoding UTF8
    $lines | ForEach-Object { Write-Host $_ }
}
$saved = Get-HomeServer
if ($Action -eq 'stop') {
    if ($saved) {
        Stop-Process -Id $saved.processId
        Remove-Item -LiteralPath $stateFile
        Write-Host 'AllModelAI home server stopped.'
    } else { Write-Host 'No managed home server is running.' }
    exit 0
}
if ($saved) {
    $health = Invoke-RestMethod "http://127.0.0.1:$($saved.port)/api/health" -TimeoutSec 5
    if (!$health.checks.database) { throw 'Database health check failed. Check .runtime logs.' }
    Show-Addresses $saved.port
    exit 0
}
if ($Action -eq 'status') { Write-Host 'The home server is not running.'; exit 1 }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is already in use. No process was stopped. Choose another port with -Port." }
if (!$SkipBuild) {
    & npm.cmd --prefix (Join-Path $projectRoot 'frontend') run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed. Server was not started.' }
}
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'frontend\dist\index.html'))) { throw 'Build the frontend first.' }
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$env:NODE_ENV = 'production'
$env:HOST = '0.0.0.0'
$env:PORT = "$Port"
$env:COOKIE_SECURE = 'false'
$process = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverFile + '"')) -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'home-server.log') -RedirectStandardError (Join-Path $runtimeDir 'home-server-error.log')
$identity = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.Id)"
if (!$identity) { throw 'Server exited during startup. See .runtime/home-server-error.log.' }
@{ processId = $process.Id; createdAt = $identity.CreationDate.ToUniversalTime().ToString('o'); port = $Port } |
    ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($process.HasExited) { throw 'Server exited. See .runtime/home-server-error.log.' }
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
        if ($health.checks.database) { Show-Addresses $Port; exit 0 }
    } catch { Start-Sleep -Milliseconds 500 }
}
throw 'Server did not become healthy. Check .runtime logs and run stop-home-server.bat before retrying.'
