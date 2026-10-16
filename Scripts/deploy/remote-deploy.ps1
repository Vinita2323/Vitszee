# Run deploy on the VPS over SSH (password prompt — password is NOT stored).
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy\remote-deploy.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\deploy\remote-deploy.ps1 -HostName 200.234.46.248 -User root

param(
  [string]$HostName = "200.234.46.248",
  [string]$User = "root",
  [string]$AppDir = "/var/www/vitszee",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$target = "$User@$HostName"

Write-Host ""
Write-Host "Deploying to $target" -ForegroundColor Cyan
Write-Host "App dir: $AppDir  branch: $Branch"
Write-Host "You will be prompted for the SSH password (not saved)." -ForegroundColor Yellow
Write-Host ""

# Single remote command; password typed interactively by OpenSSH.
$remoteCmd = "set -euo pipefail; export APP_DIR='$AppDir'; export DEPLOY_BRANCH='$Branch'; if [ -f /etc/vitszee/deploy.env ]; then set -a; . /etc/vitszee/deploy.env; set +a; fi; bash `"$AppDir/Scripts/deploy/deploy.sh`""

ssh -t $target $remoteCmd
if ($LASTEXITCODE -ne 0) {
  Write-Host "Deploy failed (exit $LASTEXITCODE)" -ForegroundColor Red
  exit $LASTEXITCODE
}
Write-Host "Remote deploy finished." -ForegroundColor Green
