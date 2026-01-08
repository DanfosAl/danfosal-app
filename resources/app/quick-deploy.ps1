# Quick Deploy Script - Updates Both Desktop and Android
# Usage: .\quick-deploy.ps1 1.1.1 "Release notes here"

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Version,
    
    [Parameter(Mandatory=$false, Position=1)]
    [string]$Notes = "Bug fixes and improvements"
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " Deploying Version $Version" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Update package.json
Write-Host "[1/7] Updating package.json..." -ForegroundColor Yellow
$pkg = Get-Content "package.json" | ConvertFrom-Json
$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"
Write-Host "Done!`n" -ForegroundColor Green

# 2. Update Android version
Write-Host "[2/7] Updating Android version..." -ForegroundColor Yellow
$parts = $Version.Split('.')
$code = ([int]$parts[0] * 10000) + ([int]$parts[1] * 100) + [int]$parts[2]

$gradle = Get-Content "android\app\build.gradle" -Raw
$gradle = $gradle -replace 'versionCode \d+', "versionCode $code"
$gradle = $gradle -replace 'versionName ".*?"', "versionName `"$Version`""
$gradle | Set-Content "android\app\build.gradle"
Write-Host "Done! (versionCode: $code)`n" -ForegroundColor Green

# 3. Update OTA manifest
Write-Host "[3/7] Creating OTA manifest..." -ForegroundColor Yellow
@"
{
    "version": "$Version",
    "versionCode": $code,
    "releaseDate": "$(Get-Date -Format 'yyyy-MM-dd')",
    "releaseNotes": ["$Notes"],
    "downloadUrl": "https://danfosal-app.web.app/downloads/danfosal-app-latest.apk",
    "minVersion": "1.0.0"
}
"@ | Set-Content "www\app-version.json"
Write-Host "Done!`n" -ForegroundColor Green

# 4. Sync Capacitor
Write-Host "[4/7] Syncing to Android..." -ForegroundColor Yellow
npx cap sync android | Out-Null
Write-Host "Done!`n" -ForegroundColor Green

# 5. Build Android
Write-Host "[5/7] Building Android APK..." -ForegroundColor Yellow
Push-Location android
.\gradlew assembleDebug --quiet
Pop-Location
Write-Host "Done!`n" -ForegroundColor Green

# 6. Deploy to Firebase
Write-Host "[6/7] Deploying to Firebase..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "www\downloads" | Out-Null
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "www\downloads\danfosal-app-v$Version.apk" -Force
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "www\downloads\danfosal-app-latest.apk" -Force
firebase deploy --only hosting | Out-Null
Write-Host "Done!`n" -ForegroundColor Green

# 7. Build Desktop
Write-Host "[7/7] Building Desktop installer..." -ForegroundColor Yellow
npm run dist | Out-Null
Write-Host "Done!`n" -ForegroundColor Green

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`nVersion: $Version" -ForegroundColor White
Write-Host "Notes: $Notes`n" -ForegroundColor White

Write-Host "Android APK:" -ForegroundColor Yellow
Write-Host "  - www\downloads\danfosal-app-v$Version.apk" -ForegroundColor Gray
Write-Host "  - Deployed to Firebase" -ForegroundColor Green
Write-Host "  - Auto-update ready!`n" -ForegroundColor Green

Write-Host "Desktop Installer:" -ForegroundColor Yellow
Write-Host "  - dist\Danfosal App Setup $Version.exe" -ForegroundColor Gray
Write-Host "  - Upload to GitHub Releases: v$Version" -ForegroundColor Cyan
Write-Host "  - Include dist\latest.yml`n" -ForegroundColor Cyan

Write-Host "Next:" -ForegroundColor Magenta
Write-Host "  1. Test Android APK on phone" -ForegroundColor White
Write-Host "  2. Create GitHub release v$Version" -ForegroundColor White
Write-Host "  3. Apps auto-update in ~60 min!`n" -ForegroundColor White
