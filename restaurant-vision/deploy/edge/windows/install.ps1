#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Install or update the Restaurant Vision edge engine as a Windows service. Idempotent: run it
  again to upgrade the code; settings, pairing and data are kept.

.DESCRIPTION
  - checks for Python 3.11+ (an all-users install, e.g. "C:\Program Files\Python312")
  - creates a virtualenv in C:\Program Files\RestaurantVision\venv and installs rv-edge + pywin32
  - downloads and verifies the YOLOX-tiny model into C:\Program Files\RestaurantVision\models
  - writes C:\ProgramData\RestaurantVision\edge.yaml (only if missing); data in ...\data, logs in ...\logs
  - registers the service "RestaurantVisionEdge": delayed auto-start, restart on failure,
    BelowNormal priority, runs as the virtual account NT SERVICE\RestaurantVisionEdge
  - restricts C:\ProgramData\RestaurantVision to SYSTEM, Administrators and the service
  - opens TCP 8787 for the local subnet only (Private/Domain networks)

.EXAMPLE
  # From an elevated PowerShell in the restaurant-vision folder:
  powershell -ExecutionPolicy Bypass -File deploy\edge\windows\install.ps1 `
      -Cloud https://cloud.example.com -PairCode ABC123
#>
[CmdletBinding()]
param(
    # Cloud base URL (written to a new edge.yaml; needed with -PairCode).
    [string]$Cloud = "",
    # Pairing code from the dashboard (Settings > Devices). Pairs now if given.
    [string]$PairCode = "",
    # YOLOX model: tiny (default) or s.
    [ValidateSet("tiny", "s")]
    [string]$Model = "tiny",
    # Python 3.11+ interpreter. Default: the py launcher (newest 3.x), then python.exe on PATH.
    [string]$Python = "",
    # Also install rv_sim (demo scenarios: rv-edge simulate).
    [switch]$WithSimulator,
    # Firewall profiles for the LAN rule. Restaurant Wi-Fi marked "Public" needs
    # Set-NetConnectionProfile -NetworkCategory Private, or -FirewallProfile Any.
    [string[]]$FirewallProfile = @("Private", "Domain"),
    # Run the service as LocalSystem instead of the virtual service account.
    [switch]$RunAsLocalSystem,
    # Install everything but do not start the service.
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ServiceName = "RestaurantVisionEdge"
$ServiceAccount = "NT SERVICE\$ServiceName"
$InstallDir = Join-Path $env:ProgramFiles "RestaurantVision"
$Venv = Join-Path $InstallDir "venv"
$VenvPython = Join-Path $Venv "Scripts\python.exe"
$DataRoot = Join-Path $env:ProgramData "RestaurantVision"
$DataDir = Join-Path $DataRoot "data"
$LogDir = Join-Path $DataRoot "logs"
$ConfigFile = Join-Path $DataRoot "edge.yaml"
$Port = 8787
$FirewallRule = "Restaurant Vision Edge (LAN)"
$Src = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path   # restaurant-vision\

function Say([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Warn([string]$Message) { Write-Warning $Message }
function Invoke-Checked([string]$Exe, [string[]]$Arguments) {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}
function ConvertTo-YamlPath([string]$Path) { return $Path.Replace("\", "/") }

if (-not (Test-Path (Join-Path $Src "edge\pyproject.toml"))) {
    throw "Run this script from a restaurant-vision checkout (missing $Src\edge)."
}
if ($PairCode -and -not $Cloud) { throw "-PairCode needs -Cloud <url>." }

# ------------------------------------------------------------------------------------ Python
function Test-Python([string[]]$Command) {
    try {
        $exe = $Command[0]
        $pre = @($Command | Select-Object -Skip 1)
        $out = & $exe @pre -c "import sys; print('%d.%d' % sys.version_info[:2]); print(sys.version_info >= (3, 11)); print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $out.Count -ge 3 -and $out[1] -eq "True") { return $out[2] }
    } catch { }
    return $null
}
$BasePython = $null
if ($Python) {
    $BasePython = Test-Python @($Python)
    if (-not $BasePython) { throw "$Python is not Python 3.11 or newer." }
} else {
    foreach ($candidate in @(@("py", "-3.13"), @("py", "-3.12"), @("py", "-3.11"), @("python"))) {
        if (Get-Command $candidate[0] -ErrorAction SilentlyContinue) {
            $BasePython = Test-Python $candidate
            if ($BasePython) { break }
        }
    }
}
if (-not $BasePython) {
    throw "Python 3.11+ not found. Install it for all users from python.org (tick 'Install for all users'), or pass -Python <path>."
}
if ($BasePython -like "$env:LOCALAPPDATA*" -or $BasePython -like "$env:USERPROFILE*") {
    Warn "Python at $BasePython is a per-user install. The service may not reach it after this user signs out or is removed; an all-users install is recommended."
}
Say "Using Python $BasePython"

# --------------------------------------------------------------------------------- folders
foreach ($dir in @($InstallDir, (Join-Path $InstallDir "models"), (Join-Path $InstallDir "service"), $DataRoot, $DataDir, $LogDir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# ----------------------------------------------------------------------- virtualenv + code
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing -and $existing.Status -ne "Stopped") {
    Say "Stopping $ServiceName for the upgrade"
    Stop-Service -Name $ServiceName -Force
    (Get-Service -Name $ServiceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60))
}
if (-not (Test-Path $VenvPython)) {
    Say "Creating virtualenv $Venv"
    Invoke-Checked $BasePython @("-m", "venv", $Venv)
}
Invoke-Checked $VenvPython @("-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--upgrade", "pip")
$packages = @((Join-Path $Src "contracts"), (Join-Path $Src "edge"))
if ($WithSimulator) { $packages += (Join-Path $Src "simulator") }
Say "Installing rv-edge and pywin32 into $Venv"
Invoke-Checked $VenvPython (@("-m", "pip", "install", "--quiet", "--disable-pip-version-check", "pywin32>=306") + $packages)
# Same version number, new code: reinstall our own packages without touching dependencies.
Invoke-Checked $VenvPython (@("-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-deps", "--force-reinstall") + $packages)

# ----------------------------------------------------------------------------------- model
$modelFile = "yolox_$Model.onnx"
$modelDir = Join-Path $InstallDir "models"
$localModel = Join-Path $Src "edge\models\$modelFile"
if ((Test-Path $localModel) -and -not (Test-Path (Join-Path $modelDir $modelFile))) {
    Copy-Item $localModel $modelDir
}
Say "Fetching / verifying $modelFile"
Copy-Item (Join-Path $Src "edge\scripts\fetch_models.py") (Join-Path $InstallDir "service\fetch_models.py") -Force
Invoke-Checked $VenvPython @((Join-Path $InstallDir "service\fetch_models.py"), "--model", $Model, "--dest", $modelDir)

# ------------------------------------------------------------------- edge-ui (setup wizard)
$uiDist = Join-Path $Src "web\apps\edge-ui\dist"
$uiDir = Join-Path $InstallDir "edge-ui"
if (Test-Path (Join-Path $uiDist "index.html")) {
    Say "Installing the setup wizard (edge-ui)"
    if (Test-Path $uiDir) { Remove-Item -Recurse -Force $uiDir }
    Copy-Item -Recurse $uiDist $uiDir
} elseif (-not (Test-Path $uiDir)) {
    Warn "edge-ui is not built ($uiDist missing): the LAN API works, the setup wizard page does not. Build it on a dev machine (cd web; pnpm --filter ./apps/edge-ui build) and re-run."
}

# -------------------------------------------------------------------------------- settings
if (-not (Test-Path $ConfigFile)) {
    Say "Writing $ConfigFile"
    $yaml = Get-Content -Raw -Encoding UTF8 (Join-Path $Src "deploy\edge\edge.example.yaml")
    $yaml = $yaml.Replace("/var/lib/rv-edge", (ConvertTo-YamlPath $DataDir))
    $yaml = $yaml.Replace("/opt/rv-edge/models/yolox_tiny.onnx", (ConvertTo-YamlPath (Join-Path $modelDir $modelFile)))
    $yaml = $yaml.Replace("/opt/rv-edge/models", (ConvertTo-YamlPath $modelDir))
    $yaml = $yaml.Replace("/opt/rv-edge/edge-ui", (ConvertTo-YamlPath $uiDir))
    if ($Cloud) { $yaml = $yaml -replace "(?m)^cloud_url:.*$", "cloud_url: $Cloud" }
    [System.IO.File]::WriteAllText($ConfigFile, $yaml, (New-Object System.Text.UTF8Encoding($false)))
} else {
    Say "Keeping existing $ConfigFile"
}

# --------------------------------------------------------------------------------- service
$serviceScript = Join-Path $InstallDir "service\rv_edge_service.py"
Copy-Item (Join-Path $PSScriptRoot "rv_edge_service.py") $serviceScript -Force
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Say "Updating service $ServiceName"
    Invoke-Checked $VenvPython @($serviceScript, "--startup", "delayed", "update")
} else {
    Say "Registering service $ServiceName"
    Invoke-Checked $VenvPython @($serviceScript, "--startup", "delayed", "install")
}
if ($RunAsLocalSystem) {
    Invoke-Checked "sc.exe" @("config", $ServiceName, "obj=", "LocalSystem")
    $account = "SYSTEM"
} else {
    Invoke-Checked "sc.exe" @("config", $ServiceName, "obj=", $ServiceAccount)
    $account = $ServiceAccount
}
# Restart after 5 s, 15 s, then every 60 s; reset the failure count after a day without one.
Invoke-Checked "sc.exe" @("failure", $ServiceName, "reset=", "86400", "actions=", "restart/5000/restart/15000/restart/60000")
# Also apply the recovery actions when the service stops with an error (not only on a crash).
Invoke-Checked "sc.exe" @("failureflag", $ServiceName, "1")

# ----------------------------------------------- permissions: secrets stay with the service
# The data folder holds the device token and camera credentials (secrets.json).
# Only SYSTEM, Administrators and the service account; children inherit from these folders.
Invoke-Checked "icacls.exe" @($DataRoot, "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F", "/Q")
if (-not $RunAsLocalSystem) {
    Invoke-Checked "icacls.exe" @($InstallDir, "/grant", "$($account):(OI)(CI)RX", "/Q")
    Invoke-Checked "icacls.exe" @($DataRoot, "/grant", "$($account):(OI)(CI)RX", "/Q")
    foreach ($dir in @($DataDir, $LogDir)) {
        Invoke-Checked "icacls.exe" @($dir, "/grant", "$($account):(OI)(CI)M", "/Q")
    }
}

# ---------------------------------------------------------------------------------- pairing
if ($PairCode) {
    Say "Pairing with $Cloud"
    Invoke-Checked (Join-Path $Venv "Scripts\rv-edge.exe") @("pair", "--config", $ConfigFile, "--code", $PairCode, "--cloud", $Cloud)
}

# --------------------------------------------------------------------------------- firewall
Get-NetFirewallRule -DisplayName $FirewallRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $FirewallRule -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort $Port -RemoteAddress LocalSubnet -Profile $FirewallProfile | Out-Null

if (-not $NoStart) {
    Say "Starting $ServiceName"
    Start-Service -Name $ServiceName
    $healthy = $false
    for ($i = 0; $i -lt 30 -and -not $healthy; $i++) {
        Start-Sleep -Seconds 1
        try {
            $healthy = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$Port/local/health").StatusCode -eq 200
        } catch { }
    }
    if (-not $healthy) { Warn "The LAN API does not answer yet. Check $LogDir\rv-edge.log and the Application event log." }
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "<this-pc-ip>" }
Write-Host ""
Write-Host "Restaurant Vision edge installed."
Write-Host "  Setup wizard   http://$($ip):$Port/   (choose the setup PIN on first visit)"
Write-Host "  Local alerts   http://$($ip):$Port/local-alerts"
Write-Host "  Settings       $ConfigFile"
Write-Host "  Data           $DataDir (back up; contains the device token and camera credentials)"
Write-Host "  Logs           $LogDir\rv-edge.log"
Write-Host "  Pair later     & '$Venv\Scripts\rv-edge.exe' pair --config '$ConfigFile' --code CODE --cloud URL; Restart-Service $ServiceName"
Write-Host "  Capacity       & '$Venv\Scripts\rv-edge.exe' check --config '$ConfigFile'"
