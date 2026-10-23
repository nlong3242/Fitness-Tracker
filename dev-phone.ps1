# Runs the backend and frontend so the iPhone can reach them over Tailscale.
# Usage (from the repo root):  .\dev-phone.ps1
# Then open http://<tailscale-ip>:5500 in Safari on the phone.

$ErrorActionPreference = "Stop"

$tailscale = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $tailscale)) { throw "Tailscale is not installed." }
$ip = (& $tailscale ip -4 | Select-Object -First 1).Trim()
if (-not $ip) { throw "Tailscale has no IP - is it logged in and connected?" }

$origins = "http://127.0.0.1:5500,http://localhost:5500,http://${ip}:5500"
Write-Host "Phone URL: http://${ip}:5500" -ForegroundColor Green

# Backend in its own window so its log stays readable.
$backendDir = Join-Path $PSScriptRoot "backend\fitness-tracker"
Start-Process powershell -WorkingDirectory $backendDir -ArgumentList @(
    "-NoExit", "-Command",
    "`$env:APP_CORS_ORIGINS='$origins'; .\mvnw.cmd spring-boot:run"
)

# Frontend on all interfaces (VS Code Live Server only listens on 127.0.0.1).
# npx.cmd, not npx: npm's npx.ps1 shim fails when called from a script.
npx.cmd -y http-server@14.1.1 (Join-Path $PSScriptRoot "frontend") -p 5500 -a 0.0.0.0 -c-1
