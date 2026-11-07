#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Remove the Restaurant Vision edge service and program files.

.DESCRIPTION
  Stops and deletes the "RestaurantVisionEdge" service, removes the firewall rule and
  C:\Program Files\RestaurantVision. C:\ProgramData\RestaurantVision (settings, pairing token,
  camera credentials, event outbox, logs) is kept unless -RemoveData is given.
  Also remove the device from the dashboard (Settings > Devices) so its token stops working.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy\edge\windows\uninstall.ps1 -RemoveData
#>
[CmdletBinding()]
param(
    # Also delete C:\ProgramData\RestaurantVision (irreversible).
    [switch]$RemoveData
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ServiceName = "RestaurantVisionEdge"
$InstallDir = Join-Path $env:ProgramFiles "RestaurantVision"
$DataRoot = Join-Path $env:ProgramData "RestaurantVision"
$FirewallRule = "Restaurant Vision Edge (LAN)"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -ne "Stopped") {
        Write-Host "==> Stopping $ServiceName"
        Stop-Service -Name $ServiceName -Force
        $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(60))
    }
    Write-Host "==> Deleting service $ServiceName"
    & sc.exe delete $ServiceName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "sc.exe delete $ServiceName failed ($LASTEXITCODE)" }
} else {
    Write-Host "Service $ServiceName is not installed."
}

Get-NetFirewallRule -DisplayName $FirewallRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule

if (Test-Path $InstallDir) {
    Write-Host "==> Removing $InstallDir"
    Remove-Item -Recurse -Force $InstallDir
}

if ($RemoveData) {
    if (Test-Path $DataRoot) {
        Write-Host "==> Removing $DataRoot"
        Remove-Item -Recurse -Force $DataRoot
    }
} elseif (Test-Path $DataRoot) {
    Write-Host "Kept $DataRoot (settings, pairing, camera credentials, outbox, logs). Use -RemoveData to delete it."
}
Write-Host "Restaurant Vision edge removed."
