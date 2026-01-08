$ErrorActionPreference = "Stop"

# Set JAVA_HOME
$javaPath = "$PWD\java\jdk-17\jdk-17.0.8+7"
$env:JAVA_HOME = $javaPath
$env:PATH = "$javaPath\bin;$env:PATH"

# Set ANDROID_HOME
$androidHome = "$PWD\android-sdk"
$env:ANDROID_HOME = $androidHome
$env:PATH = "$androidHome\cmdline-tools\latest\bin;$env:PATH"

Write-Host "Installing Android SDK components..." -ForegroundColor Cyan

# Accept licenses
"y","y","y","y","y","y","y" | sdkmanager --licenses

# Install packages
sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2"

Write-Host "SDK Setup Complete!" -ForegroundColor Green
