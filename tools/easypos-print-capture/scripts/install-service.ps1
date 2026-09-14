param(
  [string]$ServiceName = "DanfosEasyPOSCapture",
  [string]$DisplayName = "Danfos EasyPOS Receipt Capture Service"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root "src\Danfos.EasyPOS.PrintCaptureService\Danfos.EasyPOS.PrintCaptureService.csproj"
$out  = Join-Path $root "publish"

dotnet publish $proj -c Release -o $out

$exe = Join-Path $out "Danfos.EasyPOS.PrintCaptureService.exe"

Write-Host "Installing service: $ServiceName"
sc.exe create $ServiceName binPath= "`"$exe`"" DisplayName= "`"$DisplayName`"" start= auto
sc.exe start $ServiceName

Write-Host "DONE. Logs: C:\Danfosal\Logs\easypos-capture.log"
