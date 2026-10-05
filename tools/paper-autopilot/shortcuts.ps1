# Puts a shortcut in Downloads to every top-level folder of the archive, so filed papers are one
# click from where they used to be. Named "_Archive - ..." so they sort above everything else
# when Downloads is sorted by name ("_" comes before digits and letters in Explorer).
#
# Shortcuts only (.lnk): deleting one never touches the archive, unlike a folder link would.
# A new folder gets one; nothing is ever deleted (a shortcut to a folder you removed stays until
# you delete it). Prints what it made.
param(
    [string]$Source = (Join-Path $env:USERPROFILE 'Downloads'),
    [string]$Dest = 'E:\Danfos Papers',
    [string]$Installers = ''          # the installers' folder beside the archive, once it exists
)

[Console]::OutputEncoding = [Text.Encoding]::UTF8     # so "Kärcher" reaches the log intact
if (-not (Test-Path -LiteralPath $Dest)) { "no archive at $Dest"; return }
# Shortcuts report their target with backslashes; compare like with like.
$Dest = [IO.Path]::GetFullPath($Dest).TrimEnd('\')
$shell = New-Object -ComObject WScript.Shell
$prefix = '_Archive - '

function Set-Link([string]$name, [string]$target) {
    $path = Join-Path $Source ($prefix + $name + '.lnk')
    if (Test-Path -LiteralPath $path) {
        if ($shell.CreateShortcut($path).TargetPath -eq $target) { return }
    }
    $lnk = $shell.CreateShortcut($path)
    $lnk.TargetPath = $target
    $lnk.Description = "Filed papers: $target"
    $lnk.Save()
    "made $($prefix + $name)"
}

Set-Link 'All papers' $Dest
foreach ($dir in Get-ChildItem -LiteralPath $Dest -Directory | Sort-Object Name) {
    Set-Link $dir.Name $dir.FullName
}
if ($Installers -and (Test-Path -LiteralPath $Installers)) { Set-Link 'Installers' ([IO.Path]::GetFullPath($Installers).TrimEnd('\')) }
