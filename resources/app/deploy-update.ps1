# Danfosal App - Universal Update Deployment Script
# This script updates BOTH Desktop and Android apps simultaneously

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [string]$ReleaseNotes = "Bug fixes and improvements"
)

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "  Danfosal App Update Deployer" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Step 1: Update version in package.json
Write-Host "`n[1/8] Updating package.json version..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"
Write-Host "✓ Desktop version updated to $Version" -ForegroundColor Green

# Step 2: Update Android version
Write-Host "`n[2/8] Updating Android version..." -ForegroundColor Yellow
$versionParts = $Version.Split('.')
$versionCode = ([int]$versionParts[0] * 10000) + ([int]$versionParts[1] * 100) + [int]$versionParts[2]

$buildGradle = Get-Content "android\app\build.gradle" -Raw
$buildGradle = $buildGradle -replace 'versionCode \d+', "versionCode $versionCode"
$buildGradle = $buildGradle -replace 'versionName ".*"', "versionName `"$Version`""
$buildGradle | Set-Content "android\app\build.gradle"
Write-Host "✓ Android version updated to $Version (code: $versionCode)" -ForegroundColor Green

# Step 3: Update app-version.json for Android OTA updates
Write-Host "`n[3/8] Updating Android OTA manifest..." -ForegroundColor Yellow
$appVersion = @{
    version = $Version
    versionCode = $versionCode
    releaseNotes = @($ReleaseNotes)
    releaseDate = (Get-Date -Format "yyyy-MM-dd")
    downloadUrl = "https://danfosal-app.web.app/downloads/danfosal-app-latest.apk"
    minVersion = "1.0.0"
}
$appVersion | ConvertTo-Json -Depth 10 | Set-Content "www\app-version.json"
Write-Host "✓ OTA manifest updated" -ForegroundColor Green

# Step 4: Sync Capacitor
Write-Host "`n[4/8] Syncing web assets to Android..." -ForegroundColor Yellow
npx cap sync android
Write-Host "✓ Capacitor synced" -ForegroundColor Green

# Step 5: Build Android APK
Write-Host "`n[5/8] Building Android APK..." -ForegroundColor Yellow
Push-Location android
.\gradlew clean assembleDebug
Pop-Location
Write-Host "✓ Android APK built successfully" -ForegroundColor Green

# Step 6: Deploy Android APK to Firebase
Write-Host "`n[6/8] Deploying Android APK to Firebase..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "www\downloads" | Out-Null
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "www\downloads\danfosal-app-v$Version.apk" -Force
Copy-Item "android\app\build\outputs\apk\debug\app-debug.apk" "www\downloads\danfosal-app-latest.apk" -Force
firebase deploy --only hosting
Write-Host "✓ Android APK deployed to Firebase" -ForegroundColor Green

# Step 7: Build Desktop installer
Write-Host "`n[7/8] Building Desktop installer..." -ForegroundColor Yellow
npm run dist
Write-Host "✓ Desktop installer built" -ForegroundColor Green

# Step 8: Summary
Write-Host "`n[8/8] Deployment Summary" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Version: $Version" -ForegroundColor White
Write-Host "Release Notes: $ReleaseNotes" -ForegroundColor White
Write-Host "`nFiles created:" -ForegroundColor White
Write-Host "  📱 Android APK: www\downloads\danfosal-app-v$Version.apk" -ForegroundColor Green
Write-Host "  📱 Android APK: www\downloads\danfosal-app-latest.apk" -ForegroundColor Green
Write-Host "  🖥️  Desktop: dist\Danfosal App Setup $Version.exe" -ForegroundColor Green
Write-Host "`nAndroid Update:" -ForegroundColor White
Write-Host "  ✓ Deployed to Firebase Hosting" -ForegroundColor Green
Write-Host "  ✓ Auto-updater will detect on next check" -ForegroundColor Green
Write-Host "`nDesktop Update:" -ForegroundColor White
Write-Host "  -> Upload 'dist\Danfosal App Setup $Version.exe' to GitHub Releases" -ForegroundColor Yellow
Write-Host "  -> Upload 'dist\latest.yml' to GitHub Releases" -ForegroundColor Yellow
Write-Host "  -> Tag: v$Version" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Cyan

Write-Host "`n✓ Deployment complete! 🚀" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Test the Android APK on your phone" -ForegroundColor White
Write-Host "2. Create GitHub release v$Version with desktop installer" -ForegroundColor White
Write-Host "3. Both apps will auto-update within 60 minutes!" -ForegroundColor White
