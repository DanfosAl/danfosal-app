# Deploy Updates to Firebase
# This script uploads new versions to Firebase Storage for auto-update

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [string]$ReleaseNotes = "Bug fixes and improvements"
)

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Danfosal App Update Deployment" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Update version in package.json
Write-Host "1. Updating version in package.json..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 10 | Set-Content "package.json"
Write-Host "   ✓ Updated to version $Version" -ForegroundColor Green

# Update version in Android
Write-Host ""
Write-Host "2. Updating Android version..." -ForegroundColor Yellow
$versionParts = $Version.Split('.')
$versionCode = ([int]$versionParts[0] * 10000) + ([int]$versionParts[1] * 100) + [int]$versionParts[2]
Write-Host "   Version Code: $versionCode" -ForegroundColor White

# Update build.gradle
$buildGradle = Get-Content "android\app\build.gradle" -Raw
$buildGradle = $buildGradle -replace 'versionCode \d+', "versionCode $versionCode"
$buildGradle = $buildGradle -replace 'versionName "[\d\.]+"', "versionName `"$Version`""
$buildGradle | Set-Content "android\app\build.gradle"
Write-Host "   ✓ Updated Android version" -ForegroundColor Green

# Update app-version.json
Write-Host ""
Write-Host "3. Creating update manifest..." -ForegroundColor Yellow
$manifest = @{
    version = $Version
    windows = @{
        version = $Version
        url = "https://firebasestorage.googleapis.com/v0/b/danfosal-app.appspot.com/o/updates%2Fwindows%2FDanfosal-App-Setup-$Version.exe?alt=media"
        releaseDate = (Get-Date -Format "yyyy-MM-dd")
        releaseNotes = $ReleaseNotes
        mandatory = $false
        size = 0
    }
    android = @{
        version = $Version
        versionCode = $versionCode
        url = "https://firebasestorage.googleapis.com/v0/b/danfosal-app.appspot.com/o/updates%2Fandroid%2Fdanfosal-app-$Version.apk?alt=media"
        releaseDate = (Get-Date -Format "yyyy-MM-dd")
        releaseNotes = $ReleaseNotes
        mandatory = $false
        size = 0
    }
}

$manifest | ConvertTo-Json -Depth 10 | Set-Content "update-manifest.json"
$manifest | ConvertTo-Json -Depth 10 | Set-Content "public\app-version.json"
Write-Host "   ✓ Created update manifest" -ForegroundColor Green

# Build Android APK
Write-Host ""
Write-Host "4. Building Android APK..." -ForegroundColor Yellow
Push-Location android
.\gradlew assembleRelease | Out-Null
Pop-Location
$apkPath = "android\app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apkPath) {
    $apkSize = (Get-Item $apkPath).Length
    Write-Host "   ✓ Built Android APK ($([math]::Round($apkSize / 1MB, 2)) MB)" -ForegroundColor Green
    
    # Copy to release folder
    New-Item -ItemType Directory -Force -Path "releases\android" | Out-Null
    Copy-Item $apkPath "releases\android\danfosal-app-$Version.apk" -Force
    Write-Host "   ✓ Copied to releases\android\danfosal-app-$Version.apk" -ForegroundColor Green
} else {
    Write-Host "   ✗ Android build failed!" -ForegroundColor Red
}

# Update Windows app files
Write-Host ""
Write-Host "5. Updating Windows app files..." -ForegroundColor Yellow
$windowsPath = "release-build\danfosal-app-win32-x64\resources\app"
if (Test-Path $windowsPath) {
    robocopy "www" "$windowsPath\www" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP /XD "downloads" | Out-Null
    Copy-Item "main.js" "$windowsPath\" -Force
    Copy-Item "preload.js" "$windowsPath\" -Force
    Copy-Item "package.json" "$windowsPath\" -Force
    Write-Host "   ✓ Updated Windows app files" -ForegroundColor Green
} else {
    Write-Host "   ✗ Windows app folder not found!" -ForegroundColor Red
}

# Deploy to Firebase
Write-Host ""
Write-Host "6. Deploying to Firebase..." -ForegroundColor Yellow
firebase deploy --only hosting
Write-Host "   ✓ Deployed web app" -ForegroundColor Green

# Upload update manifest to Firebase Storage
Write-Host ""
Write-Host "7. Uploading update manifest to Firebase Storage..." -ForegroundColor Yellow
Write-Host "   Please manually upload the following files to Firebase Storage:" -ForegroundColor Yellow
Write-Host "   - update-manifest.json → updates/update-manifest.json" -ForegroundColor White
Write-Host "   - releases\android\danfosal-app-$Version.apk → updates/android/danfosal-app-$Version.apk" -ForegroundColor White
Write-Host "   (Windows installer will be uploaded after you build it)" -ForegroundColor White

Write-Host ""
Write-Host "===============================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Upload files to Firebase Storage (see above)" -ForegroundColor White
Write-Host "2. Zip the release-build\danfosal-app-win32-x64 folder" -ForegroundColor White
Write-Host "3. Test the update system on a different PC" -ForegroundColor White
Write-Host ""
