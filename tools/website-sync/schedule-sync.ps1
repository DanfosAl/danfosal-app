# Turns the daily website sync on or off.
#
#   powershell -ExecutionPolicy Bypass -File schedule-sync.ps1          turn it on
#   powershell -ExecutionPolicy Bypass -File schedule-sync.ps1 -Off     turn it off
#
# The owner's rule (10 Oct 2026): sync once a day, in the morning. The task starts at 07:30 and at
# every logon (a PC that was off at 07:30 catches up when it is turned on); --daily lets only the
# first successful run of the day do anything. Same shape as "Danfosal Paper Autopilot": wscript
# and a hidden .vbs launcher, no window, runs as the logged-on user.
param([switch]$Off)

$name = 'Danfosal Website Sync'
if ($Off) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    "Turned off: '$name' removed."
    return
}

if (-not (Test-Path (Join-Path $PSScriptRoot 'website-sync.local.json'))) {
    "Missing website-sync.local.json next to this script: put the sync address and key in it first (README.md)."
    return
}

$user = "$env:USERDOMAIN\$env:USERNAME"
$vbs = Join-Path $PSScriptRoot 'sync-hidden.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//nologo `"$vbs`"" -WorkingDirectory $PSScriptRoot
$morning = New-ScheduledTaskTrigger -Daily -At '07:30'
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$logon.Delay = 'PT5M'        # let the desktop and the network settle after turning on
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($morning, $logon) -Settings $settings -Principal $principal `
    -Description 'Once a day: sends stock, prices and costs to AI Commerce (danfosal.com), brings website price changes and orders into Danfosal App. Tool: E:\DanfosalApp\tools\website-sync' `
    -Force | Out-Null
"Turned on: '$name' - every day at 07:30 and at logon; runs at most once a day."
"Log: C:\Danfosal\Reports\website-sync\website-sync.log"
