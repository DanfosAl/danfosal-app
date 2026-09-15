# Start EasyPOS Complete Pipeline
# Runs both Print Capture Service and OCR Bridge together

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  EasyPOS → OCR Pipeline Starter" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$printCaptureScript = "E:\DanfosalApp\tools\easypos-print-capture\scripts\debug-run.ps1"
$bridgeDir = "E:\DanfosalApp\resources\app"

# Check if Print Capture Service is already running
$printCaptureRunning = Get-Process -Name "Danfos.EasyPOS.PrintCaptureService" -ErrorAction SilentlyContinue

if ($printCaptureRunning) {
    Write-Host "✓ Print Capture Service already running (PID: $($printCaptureRunning.Id))" -ForegroundColor Green
} else {
    Write-Host "Starting Print Capture Service..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "& '$printCaptureScript'"
    Start-Sleep -Seconds 3
    Write-Host "✓ Print Capture Service started" -ForegroundColor Green
}

Write-Host "`nStarting OCR Bridge..." -ForegroundColor Yellow
Set-Location $bridgeDir
node easypos-ocr-bridge.js
