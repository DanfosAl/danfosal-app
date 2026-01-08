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
$KeystorePass = "123456"

# Set JAVA_HOME for apksigner
$env:JAVA_HOME = $JavaHome
$env:Path = "$JavaHome\bin;$env:Path"

Write-Host "Checking for keystore..."
if (-not (Test-Path $Keystore)) {
    Write-Host "Generating new keystore..."
    & $Keytool -genkey -v -keystore $Keystore -alias $KeystoreAlias -keyalg RSA -keysize 2048 -validity 10000 -storepass $KeystorePass -keypass $KeystorePass -dname "CN=Danfosal, OU=App, O=Danfosal, L=Unknown, S=Unknown, C=Unknown"
} else {
    Write-Host "Keystore already exists."
}

Write-Host "Aligning APK..."
if (Test-Path $AlignedApk) { Remove-Item $AlignedApk }
& $Zipalign -v -p 4 $UnsignedApk $AlignedApk

Write-Host "Signing APK..."
& $ApkSigner sign --ks $Keystore --ks-key-alias $KeystoreAlias --ks-pass pass:$KeystorePass --key-pass pass:$KeystorePass --out $SignedApk $AlignedApk

Write-Host "--------------------------------------------------"
Write-Host "APK Signed Successfully!"
Write-Host "Signed APK location: $SignedApk"
Write-Host "Transfer this file to your phone and install it."
Write-Host "--------------------------------------------------"
