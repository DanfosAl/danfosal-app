# Quick Copy Script for Other Computers
# This helps copy the updated app to USB or network location

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Danfosal App - Distribution Helper   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$sourceFolder = "C:\Users\leutr\OneDrive\Desktop\danfosal-app\release-build\danfosal-app-win32-x64"

# Check if source exists
if (-not (Test-Path $sourceFolder)) {
    Write-Host "ERROR: Source folder not found!" -ForegroundColor Red
    Write-Host "Expected: $sourceFolder" -ForegroundColor Yellow
    exit 1
}

Write-Host "Source folder found!" -ForegroundColor Green
Write-Host "Location: $sourceFolder" -ForegroundColor Gray
Write-Host ""

# Ask for destination
Write-Host "Where do you want to copy the app?" -ForegroundColor Yellow
Write-Host "Examples:" -ForegroundColor Gray
Write-Host "  D:\                    (USB drive)" -ForegroundColor Gray
Write-Host "  \\ServerName\Share\    (Network share)" -ForegroundColor Gray
Write-Host "  C:\Temp\               (Local folder)" -ForegroundColor Gray
Write-Host ""
$destination = Read-Host "Enter destination path"

if ([string]::IsNullOrWhiteSpace($destination)) {
    Write-Host "No destination specified. Exiting." -ForegroundColor Red
    exit 1
}

# Create destination if it doesn't exist
if (-not (Test-Path $destination)) {
    Write-Host "Creating destination folder..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
}

$fullDestination = Join-Path $destination "danfosal-app-win32-x64"

Write-Host ""
Write-Host "Copying files..." -ForegroundColor Yellow
Write-Host "This may take a few minutes (382 MB)..." -ForegroundColor Gray
Write-Host ""

try {
    Copy-Item -Path $sourceFolder -Destination $destination -Recurse -Force
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Copy Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "App copied to: $fullDestination" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Go to the other computer" -ForegroundColor White
    Write-Host "2. Copy this folder to the computer" -ForegroundColor White
    Write-Host "3. Run verify-update.ps1 to verify" -ForegroundColor White
    Write-Host "4. Launch danfosal-app.exe" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "ERROR: Copy failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
