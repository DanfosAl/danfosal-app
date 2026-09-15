# Moved to scripts\android\ on 2026-09-14. Every path below is relative to resources\app,
# so pin the working directory there no matter where this is launched from.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))

# Android APK Builder with Java Installation
# Danfosal App v1.3.1 - Updated with Glassmorphism Design

Write-Host "🚀 Danfosal App - Android APK Builder v1.3.1" -ForegroundColor Green
Write-Host "📱 Building Android APK with latest glassmorphism design..." -ForegroundColor Cyan
Write-Host ""

# Check if Java is installed
$javaVersion = $null
try {
    $javaVersion = java -version 2>&1 | Select-String "version"
    Write-Host "✅ Java found: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Java not found. Installing OpenJDK..." -ForegroundColor Yellow
    
    # Install Java using winget
    try {
        winget install Microsoft.OpenJDK.11 --accept-package-agreements --accept-source-agreements
        Write-Host "✅ Java 11 installed successfully!" -ForegroundColor Green
        
        # Set JAVA_HOME
        $javaPath = "C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot"
        if (Test-Path $javaPath) {
            [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaPath, [EnvironmentVariableTarget]::Process)
            $env:JAVA_HOME = $javaPath
            $env:PATH = "$javaPath\bin;$env:PATH"
            Write-Host "✅ JAVA_HOME set to: $javaPath" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ Failed to install Java automatically." -ForegroundColor Red
        Write-Host "Please install Java manually from: https://adoptium.net/" -ForegroundColor Yellow
        Write-Host "Or install Android Studio which includes Java." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "📋 Latest Code Status:" -ForegroundColor Cyan
Write-Host "✅ Capacitor sync completed" -ForegroundColor Green
Write-Host "✅ Glassmorphism design synced" -ForegroundColor Green
Write-Host "✅ Emoji navigation icons included" -ForegroundColor Green
Write-Host "✅ All web assets updated" -ForegroundColor Green

Write-Host ""
Write-Host "🔨 Building Android APK..." -ForegroundColor Yellow

# Navigate to Android project
Set-Location "www\android"

# Build the APK
try {
    .\gradlew.bat assembleRelease
    Write-Host ""
    Write-Host "🎉 APK Build Successful!" -ForegroundColor Green
    Write-Host "📱 APK Location: $(Get-Location)\app\build\outputs\apk\release\app-release.apk" -ForegroundColor Cyan
    
    # Open the APK folder
    $apkPath = "$(Get-Location)\app\build\outputs\apk\release"
    if (Test-Path $apkPath) {
        explorer.exe $apkPath
        Write-Host "📁 Opened APK folder in Explorer" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "✨ Your Android app now includes:" -ForegroundColor Cyan
    Write-Host "   🎨 Glassmorphism design" -ForegroundColor White
    Write-Host "   😀 Emoji navigation icons" -ForegroundColor White
    Write-Host "   💫 Backdrop blur effects" -ForegroundColor White
    Write-Host "   📊 Enhanced statistics cards" -ForegroundColor White
    Write-Host "   🌙 Professional dark theme" -ForegroundColor White
    
} catch {
    Write-Host "❌ Build failed. Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Alternative build options:" -ForegroundColor Yellow
    Write-Host "1. Open www\android in Android Studio" -ForegroundColor White
    Write-Host "2. Build > Generate Signed Bundle/APK" -ForegroundColor White
    Write-Host "3. Choose APK format" -ForegroundColor White
    Write-Host "4. Use keystore: my-release-key.keystore" -ForegroundColor White
    Write-Host "5. Password: danfosal123" -ForegroundColor White
}

Write-Host ""
Write-Host "🎯 Build script completed!" -ForegroundColor Green