# Moved to scripts\android\ on 2026-09-14. Every path below is relative to resources\app,
# so pin the working directory there no matter where this is launched from.
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))

$ErrorActionPreference = "Stop"

# Paths
$AppDir = Get-Location
$JavaHome = "$AppDir\java\jdk-17\jdk-17.0.8+7"
$AndroidHome = "$AppDir\android-sdk"
$BuildToolsVersion = "34.0.0"
$BuildToolsDir = "$AndroidHome\build-tools\$BuildToolsVersion"
$Keytool = "$JavaHome\bin\keytool.exe"
$Zipalign = "$BuildToolsDir\zipalign.exe"
$ApkSigner = "$BuildToolsDir\apksigner.bat"

$UnsignedApk = "$AppDir\android\app\build\outputs\apk\release\app-release-unsigned.apk"
$AlignedApk = "$AppDir\android\app\build\outputs\apk\release\app-release-aligned.apk"
$SignedApk = "$AppDir\android\app\build\outputs\apk\release\app-release-signed.apk"
$Keystore = "$AppDir\my-release-key.keystore"
$KeystoreAlias = "my-key-alias"
# The keystore password is never written in this file: the repository is public, and the old
# hard-coded one was flagged by GitGuardian on 19 Nov 2026 (GOLDEN_MANIFEST.md, Finding #88).
# The script asks for it, or takes it from $env:DANFOSAL_KEYSTORE_PASS if that is already set in
# this window. It is handed to keytool/apksigner through that variable, never on a command line.
if (-not $env:DANFOSAL_KEYSTORE_PASS) {
    $secure = Read-Host "Password of $Keystore" -AsSecureString
    $env:DANFOSAL_KEYSTORE_PASS = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if (-not $env:DANFOSAL_KEYSTORE_PASS) { throw "No keystore password given." }

# Set JAVA_HOME for apksigner
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;$env:Path"

Write-Host "Checking for keystore..."
if (-not (Test-Path $Keystore)) {
    Write-Host "Generating new keystore..."
    & $Keytool -genkey -v -keystore $Keystore -alias $KeystoreAlias -keyalg RSA -keysize 2048 -validity 10000 -storepass:env DANFOSAL_KEYSTORE_PASS -keypass:env DANFOSAL_KEYSTORE_PASS -dname "CN=Danfosal, OU=App, O=Danfosal, L=Unknown, S=Unknown, C=Unknown"
} else {
    Write-Host "Keystore already exists."
}

Write-Host "Aligning APK..."
if (Test-Path $AlignedApk) { Remove-Item $AlignedApk }
& $Zipalign -v -p 4 $UnsignedApk $AlignedApk

Write-Host "Signing APK..."
& $ApkSigner sign --ks $Keystore --ks-key-alias $KeystoreAlias --ks-pass env:DANFOSAL_KEYSTORE_PASS --key-pass env:DANFOSAL_KEYSTORE_PASS --out $SignedApk $AlignedApk

Write-Host "--------------------------------------------------"
Remove-Item Env:DANFOSAL_KEYSTORE_PASS -ErrorAction SilentlyContinue
Write-Host "APK Signed Successfully!"
Write-Host "Signed APK location: $SignedApk"
Write-Host "Transfer this file to your phone and install it."
Write-Host "--------------------------------------------------"
