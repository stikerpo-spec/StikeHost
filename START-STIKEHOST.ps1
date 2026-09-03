Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 20+ ist nicht installiert." -ForegroundColor Red
  Read-Host "Enter"
  exit 1
}
if (-not (Test-Path "node_modules")) { npm install }
Start-Process "http://localhost:3000"
npm start
