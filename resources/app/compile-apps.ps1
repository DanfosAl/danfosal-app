# Compile Desktop and Android Apps
$ErrorActionPreference = "Stop"

# 1. Desktop Build
Write-Host " Building Desktop App..." -ForegroundColor Cyan
# We use electron-packager because electron-builder failed with permission issues
npm run package

# 2. Android Build
Write-Host " Setting up Android App..." -ForegroundColor Cyan

# Java Detection
$javaVersion = $null
try {
    $javaVersion = java -version 2>&1 | Select-String "version"
    # Check if it is version 17
    if ($javaVersion -match "17\.") {
        Write-Host " Java 17 found: $javaVersion" -ForegroundColor Green
    } else {
        throw "Java 17 not found in PATH (found $javaVersion)"
    }
} catch {
    Write-Host " Java 17 not found in PATH. Checking common locations..." -ForegroundColor Yellow
    
    # Check common paths
    $commonPaths = @(
        "$PWD\java\jdk-17\jdk-17.0.8+7",
        "$PWD\java\jdk-17.0.8+7",
        "$PWD\java\jdk-11.0.2",
        "C:\Program Files\Microsoft\jdk-11.0.16.101-hotspot",
        "C:\Program Files\Java\jdk-17*",
        "C:\Program Files\Java\jdk-11*",
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre"
    )
    
    $foundJava = $false
    foreach ($pattern in $commonPaths) {
        $paths = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
        if ($paths) {
            $javaPath = $paths[0].FullName
            # If it's a directory containing bin, use it. If it's the bin directory, go up.
            if (Test-Path "$javaPath\bin") {
                 # Correct path
            } elseif ($javaPath.EndsWith("bin")) {
                 $javaPath = (Get-Item $javaPath).Parent.FullName
            }
            
            [Environment]::SetEnvironmentVariable("JAVA_HOME", $javaPath, [EnvironmentVariableTarget]::Process)
            $env:JAVA_HOME = $javaPath
            $env:PATH = "$javaPath\bin;$env:PATH"
            Write-Host " JAVA_HOME set to: $javaPath" -ForegroundColor Green
            $foundJava = $true
            break
        }
    }
    
    if (-not $foundJava) {
        Write-Host " Java not found. Android build might fail." -ForegroundColor Red
        Write-Host "Please install Java 17 (required for latest Android Gradle Plugin) or Android Studio." -ForegroundColor Yellow
    }
}

# Android SDK Detection
$sdkPaths = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Android\Sdk",
    "$PWD\android-sdk"
)

$foundSdk = $false
foreach ($path in $sdkPaths) {
    if (Test-Path $path) {
        [Environment]::SetEnvironmentVariable("ANDROID_HOME", $path, [EnvironmentVariableTarget]::Process)
        $env:ANDROID_HOME = $path
        Write-Host " ANDROID_HOME set to: $path" -ForegroundColor Green
        $foundSdk = $true
        break
    }
}

if (-not $foundSdk) {
    Write-Host " Android SDK not found. Android build will likely fail." -ForegroundColor Red
    Write-Host "Please install Android Studio or set ANDROID_HOME." -ForegroundColor Yellow
}

if (-not (Test-Path "android")) {
    Write-Host "Android folder not found. Adding Android platform..." -ForegroundColor Yellow
    npx cap add android
}

Write-Host " Syncing with Capacitor..." -ForegroundColor Cyan
npx cap sync

Write-Host " Building Android APK..." -ForegroundColor Cyan
if (Test-Path "android") {
    Push-Location android
    if (Test-Path "gradlew.bat") {
        .\gradlew.bat assembleRelease
    } else {
        Write-Error "gradlew.bat not found in android folder."
    }
    Pop-Location
}

Write-Host " Build Complete!" -ForegroundColor Green
Write-Host "Desktop App: $(Resolve-Path release-build/danfosal-app-win32-x64/danfosal-app.exe)" -ForegroundColor Green
if (Test-Path "android/app/build/outputs/apk/release/app-release-unsigned.apk") {
    Write-Host "Android APK: $(Resolve-Path android/app/build/outputs/apk/release/app-release-unsigned.apk)" -ForegroundColor Green
} else {
    Write-Host " Android APK not found. Build might have failed." -ForegroundColor Yellow
}
