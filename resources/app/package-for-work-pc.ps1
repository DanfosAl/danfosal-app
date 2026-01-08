# Package Windows App for Work PC
# Simple copy method - no compression needed

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Package Danfosal App for Work PC" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

$sourcePath = "release-build\danfosal-app-win32-x64"
$destPath = "danfosal-app-portable"

Write-Host "Creating portable package..." -ForegroundColor Yellow

# Remove old portable if exists
if (Test-Path $destPath) {
    Remove-Item $destPath -Recurse -Force
}

# Create new portable folder
New-Item -ItemType Directory -Path $destPath | Out-Null

Write-Host "Copying app files..." -ForegroundColor Yellow
# Copy essential files only
robocopy $sourcePath $destPath /E /NFL /NDL /NJH /NJS /NC /NS /NP /XD "locales" "swiftshader" | Out-Null

$size = (Get-ChildItem $destPath -Recurse -File | Measure-Object Length -Sum).Sum / 1MB

Write-Host ""
Write-Host "✓ Created: $destPath\ ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Copy the '$destPath' folder to USB drive" -ForegroundColor White
Write-Host "2. Transfer to work PC" -ForegroundColor White  
Write-Host "3. Extract and run 'Launch Danfosal App.bat'" -ForegroundColor White
Write-Host ""
Write-Host "The app will automatically check for updates!" -ForegroundColor Green
Write-Host ""
