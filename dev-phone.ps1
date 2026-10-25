# Runs the backend and frontend so the iPhone can reach them over Tailscale.
# Usage (from the repo root):  .\dev-phone.ps1
# Then open http://<tailscale-ip>:5500 in Safari on the phone.

$ErrorActionPreference = "Stop"

$tailscale = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $tailscale)) { throw "Tailscale is not installed." }
$ip = (& $tailscale ip -4 | Select-Object -First 1).Trim()
if (-not $ip) { throw "Tailscale has no IP - is it logged in and connected?" }

# capacitor://localhost is the origin of the iOS app (mobile/).
$origins = "http://127.0.0.1:5500,http://localhost:5500,http://${ip}:5500,capacitor://localhost"
Write-Host "Phone URL: http://${ip}:5500" -ForegroundColor Green

# Code needed to create an account. Only reachable over Tailscale here, so a
# fixed default is fine; set APP_INVITE_CODE first to use another. A real
# server must set its own.
$inviteCode = if ($env:APP_INVITE_CODE) { $env:APP_INVITE_CODE } else { "tsu2track" }
Write-Host "Invite code: $inviteCode" -ForegroundColor Green

$backendDir = Join-Path $PSScriptRoot "backend\fitness-tracker"

# Copy the database before the backend starts (and runs any new migrations).
# The backend isn't running yet, so a plain file copy is consistent. Keeps
# the newest $keep copies in each folder.
function Backup-Database($db, $dirs, $keep = 10) {
    $stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
    foreach ($dir in $dirs) {
        try {
            New-Item -ItemType Directory -Force $dir | Out-Null
            Copy-Item $db (Join-Path $dir "fitness-before-start-$stamp.mv.db")
            Get-ChildItem $dir -Filter "fitness-before-start-*.mv.db" |
                Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item
            Write-Host "Database backed up to $dir" -ForegroundColor Green
        } catch {
            # A failed backup must not stop the app from starting.
            Write-Host "Backup to $dir failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

# Local copy, plus one in the personal OneDrive (when signed in) so a copy
# lives off this PC. Restore: stop the backend, copy the chosen file over
# data\fitness.mv.db, start again.
$db = Join-Path $backendDir "data\fitness.mv.db"
$backendUp = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue
if ($backendUp) {
    Write-Host "Backend already running on 8080 - skipping the database backup." -ForegroundColor Yellow
} elseif (Test-Path $db) {
    $backupDirs = @(Join-Path $backendDir "backups")
    $oneDrive = (Get-ItemProperty "HKCU:\Software\Microsoft\OneDrive\Accounts\Personal" -ErrorAction SilentlyContinue).UserFolder
    if ($oneDrive) { $backupDirs += Join-Path $oneDrive "Tsu2Track backups" }
    Backup-Database $db $backupDirs
}

# Backend in its own window so its log stays readable.
Start-Process powershell -WorkingDirectory $backendDir -ArgumentList @(
    "-NoExit", "-Command",
    "`$env:APP_CORS_ORIGINS='$origins'; `$env:APP_INVITE_CODE='$inviteCode'; .\mvnw.cmd spring-boot:run"
)

# Frontend on all interfaces (VS Code Live Server only listens on 127.0.0.1).
# npx.cmd, not npx: npm's npx.ps1 shim fails when called from a script.
npx.cmd -y http-server@14.1.1 (Join-Path $PSScriptRoot "frontend") -p 5500 -a 0.0.0.0 -c-1
