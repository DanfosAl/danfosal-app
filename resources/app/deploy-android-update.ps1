# Deploy Android APK to Firebase Hosting for OTA updates

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    [string]$ApkPath = "android\app\build\outputs\apk\release\app-release.apk"
)

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Deploying Android v$Version" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if APK exists
if (-Not (Test-Path $ApkPath)) {
    Write-Host "Error: APK not found at $ApkPath" -ForegroundColor Red
    Write-Host "Build the APK first using build-android.ps1 or Android Studio" -ForegroundColor Yellow
    exit 1
}

# Create downloads directory in www
$downloadsDir = "www\downloads"
if (-Not (Test-Path $downloadsDir)) {
    New-Item -ItemType Directory -Path $downloadsDir | Out-Null
}

# Copy APK to www/downloads with version name
Write-Host "1. Copying APK to deployment folder..." -ForegroundColor Yellow
$versionedApk = "www\downloads\danfosal-app-v$Version.apk"
$latestApk = "www\downloads\danfosal-app-latest.apk"

Copy-Item $ApkPath $versionedApk -Force
Copy-Item $ApkPath $latestApk -Force

Write-Host "   ✓ Versioned APK: $versionedApk" -ForegroundColor Green
Write-Host "   ✓ Latest APK: $latestApk" -ForegroundColor Green

# Update app-version.json
Write-Host "2. Updating version manifest..." -ForegroundColor Yellow
$versionJson = @{
    version = $Version
    versionCode = (Get-Content "android\app\build.gradle" | Select-String "versionCode (\d+)" | ForEach-Object { $_.Matches.Groups[1].Value })
    releaseDate = (Get-Date -Format "yyyy-MM-dd")
    releaseNotes = @(
        "New features and improvements",
        "Bug fixes and performance enhancements"
    )
    minSupportedVersion = "1.0.0"
    downloadUrl = "https://danfosal-app.web.app/downloads/danfosal-app-latest.apk"
} | ConvertTo-Json -Depth 10

Set-Content "www\app-version.json" $versionJson

# Deploy to Firebase Hosting
Write-Host "3. Deploying to Firebase Hosting..." -ForegroundColor Yellow
firebase deploy --only hosting

Write-Host ""
Write-Host "================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Update URL: https://danfosal-app.web.app/downloads/danfosal-app-latest.apk" -ForegroundColor Cyan
Write-Host "Version JSON: https://danfosal-app.web.app/app-version.json" -ForegroundColor Cyan
Write-Host ""
Write-Host "Users with the app installed will:" -ForegroundColor Yellow
Write-Host "  ✓ Get update notification within 1 hour" -ForegroundColor White
Write-Host "  ✓ Download APK with one tap" -ForegroundColor White
Write-Host "  ✓ Install update automatically" -ForegroundColor White
Write-Host ""
Write-Host "Share APK directly:" -ForegroundColor Yellow
Write-Host "  Local: $versionedApk" -ForegroundColor White
Write-Host "  Online: https://danfosal-app.web.app/downloads/danfosal-app-v$Version.apk" -ForegroundColor White
Write-Host ""
