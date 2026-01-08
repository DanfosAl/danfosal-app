# Danfosal App - Complete Deployment Script
# Builds Windows app and Android APK

param(
    [string]$Version = "1.2.0",
    [int]$AndroidVersionCode = 3
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DANFOSAL APP - COMPLETE DEPLOYMENT   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor White
Write-Host "  Android Code: $AndroidVersionCode" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Deploy web app to Firebase
Write-Host "[1/4] Deploying web app to Firebase..." -ForegroundColor Yellow
firebase deploy --only hosting
if ($LASTEXITCODE -ne 0) {
    Write-Host "Firebase deployment failed!" -ForegroundColor Red
    exit 1
}
Write-Host "SUCCESS: Web app deployed!" -ForegroundColor Green
Write-Host ""

# Step 2: Build Windows app
Write-Host "[2/4] Building Windows installer..." -ForegroundColor Yellow

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Update version in package.json
Write-Host "Updating package.json version..." -ForegroundColor Gray
$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 100 | Set-Content "package.json"

# Build Windows installer
npm run dist
if ($LASTEXITCODE -ne 0) {
    Write-Host "Windows build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "SUCCESS: Windows installer built!" -ForegroundColor Green
Write-Host ""

# Step 3: Prepare Android build
Write-Host "[3/4] Preparing Android build..." -ForegroundColor Yellow

# Sync web assets to Android
Write-Host "Syncing web assets to Android..." -ForegroundColor Gray
npx cap sync android

# Update Android version
Write-Host "Updating Android version info..." -ForegroundColor Gray
$gradlePath = "android\app\build.gradle"
if (Test-Path $gradlePath) {
    $gradleContent = Get-Content $gradlePath -Raw
    $gradleContent = $gradleContent -replace 'versionCode \d+', "versionCode $AndroidVersionCode"
    $gradleContent = $gradleContent -replace 'versionName "[\d\.]+"', "versionName `"$Version`""
    Set-Content $gradlePath $gradleContent
}

Write-Host "SUCCESS: Android project prepared!" -ForegroundColor Green
Write-Host ""

# Step 4: Build Android APK
Write-Host "[4/4] Building Android APK..." -ForegroundColor Yellow
Write-Host "This may take a few minutes..." -ForegroundColor Gray
Write-Host ""

Set-Location android
.\gradlew assembleRelease
$buildSuccess = $LASTEXITCODE -eq 0
Set-Location ..

if ($buildSuccess) {
    Write-Host "SUCCESS: Android APK built!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Android build completed with warnings" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOYMENT COMPLETE!                  " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Show results
Write-Host "Build Artifacts:" -ForegroundColor Cyan
Write-Host ""

# Windows installer
$winInstallerPath = "dist\Danfosal App Setup $Version.exe"
if (Test-Path $winInstallerPath) {
    Write-Host "SUCCESS: Windows Installer:" -ForegroundColor Green
    Write-Host "  Location: $winInstallerPath" -ForegroundColor White
    $winSize = (Get-Item $winInstallerPath).Length / 1MB
    Write-Host "  Size: $([math]::Round($winSize, 2)) MB" -ForegroundColor Gray
} elseif (Test-Path "dist") {
    Write-Host "WARNING: Windows installer not found at expected location" -ForegroundColor Yellow
    Write-Host "  Check dist folder for installer" -ForegroundColor Gray
    $distFiles = Get-ChildItem -Path "dist" -Filter "*.exe"
    if ($distFiles) {
        Write-Host "  Found: $($distFiles[0].Name)" -ForegroundColor Gray
    }
} else {
    Write-Host "ERROR: dist folder not found" -ForegroundColor Red
}
Write-Host ""

# Android APK
$apkPath = "android\app\build\outputs\apk\release\app-release-unsigned.apk"
if (Test-Path $apkPath) {
    Write-Host "SUCCESS: Android APK (unsigned):" -ForegroundColor Green
    Write-Host "  Location: $apkPath" -ForegroundColor White
    $apkSize = (Get-Item $apkPath).Length / 1MB
    Write-Host "  Size: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Gray
} else {
    Write-Host "WARNING: Android APK not found" -ForegroundColor Yellow
    Write-Host "  You may need to sign it in Android Studio" -ForegroundColor Gray
}
Write-Host ""

# Web app
Write-Host "SUCCESS: Web App:" -ForegroundColor Green
Write-Host "  URL: https://danfosal-app.web.app" -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NEXT STEPS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Windows App:" -ForegroundColor Yellow
Write-Host "1. Test the installer in dist folder" -ForegroundColor White
Write-Host "2. Upload to GitHub Releases or your hosting" -ForegroundColor White
Write-Host ""

Write-Host "Android App:" -ForegroundColor Yellow
Write-Host "1. Sign the APK in Android Studio:" -ForegroundColor White
Write-Host "   - Open android folder in Android Studio" -ForegroundColor White
Write-Host "   - Build > Generate Signed Bundle/APK" -ForegroundColor White
Write-Host "   - Choose APK and sign with your keystore" -ForegroundColor White
Write-Host "2. Upload signed APK to www\downloads\" -ForegroundColor White
Write-Host "3. Deploy to Firebase: firebase deploy --only hosting" -ForegroundColor White
Write-Host ""

# Offer to open folders
$response = Read-Host "Open build folders? (y/n)"
if ($response -eq 'y') {
    if (Test-Path "dist") {
        explorer dist
    }
    if (Test-Path "android\app\build\outputs\apk\release") {
        explorer android\app\build\outputs\apk\release
    }
}

Write-Host ""
Write-Host "Deployment script completed!" -ForegroundColor Green
Write-Host ""
