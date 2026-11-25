[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$requirementsPath = Join-Path $PSScriptRoot "backend\requirements.txt"
$envPath = Join-Path $PSScriptRoot "backend\.env"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python was not found on PATH. Install Python and try again."
}

if (-not (Test-Path -LiteralPath $requirementsPath)) {
    throw "Backend requirements file not found: $requirementsPath"
}

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Backend configuration is missing. Copy backend\.env.example to backend\.env and set its values."
}

if (-not $SkipInstall) {
    Write-Host "Installing backend dependencies..."
    & python -m pip install -r $requirementsPath
    if ($LASTEXITCODE -ne 0) {
        throw "Dependency installation failed."
    }
}

$configurationCheck = @'
import os
import sys
from pathlib import Path
from dotenv import dotenv_values

settings = dotenv_values(Path("backend") / ".env")
required = ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD")
missing = [
    key
    for key in required
    if not (
        os.environ[key] if key in os.environ else settings.get(key)
    )
]
if missing:
    print("Missing database settings: " + ", ".join(missing))
    sys.exit(1)

print("Database settings are configured.")
'@

Write-Host "Checking database configuration..."
$configurationCheck | & python -
if ($LASTEXITCODE -ne 0) {
    throw "Complete the missing settings in backend\.env and run this script again."
}

Write-Host "Starting the backend and frontend at http://127.0.0.1:8000/"
Write-Host "Press Ctrl+C to stop the application."
& python -m uvicorn backend.app:app --reload
if ($LASTEXITCODE -ne 0) {
    throw "The application stopped with an error."
}
