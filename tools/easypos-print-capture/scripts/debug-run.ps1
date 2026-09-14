$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root "src\Danfos.EasyPOS.PrintCaptureService"
dotnet run --project $proj
