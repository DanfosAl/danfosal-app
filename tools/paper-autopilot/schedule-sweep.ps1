# Turns the weekly Paper Autopilot sweep on or off.
#
#   powershell -ExecutionPolicy Bypass -File schedule-sweep.ps1          turn it on
#   powershell -ExecutionPolicy Bypass -File schedule-sweep.ps1 -Off     turn it off
#
# The owner's rule (26 Sep 2026): file Downloads every Monday, when the PC is turned on or while
# it is on. So the task starts at every logon and at 09:00 on Mondays (also catching up on a
# missed 09:00), and the sweep's --weekly guard lets only the first start on or after a Monday
# do anything. It runs as the logged-on user, because it needs their Downloads and Recycle Bin.
# Same shape as "Danfosal EasyPOS Watchdog": wscript + a hidden .vbs launcher, no window.
param([switch]$Off)

$name = 'Danfosal Paper Autopilot'
if ($Off) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    "Turned off: '$name' removed."
    return
}

$user = "$env:USERDOMAIN\$env:USERNAME"
$vbs = Join-Path $PSScriptRoot 'sweep-hidden.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//nologo `"$vbs`"" -WorkingDirectory $PSScriptRoot
$monday = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '09:00'
$logon = New-ScheduledTaskTrigger -AtLogOn -User $user
$logon.Delay = 'PT3M'        # let the desktop settle after turning on
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($monday, $logon) -Settings $settings -Principal $principal `
    -Description 'Files new PDFs from Downloads into E:\Danfos Papers once a week (Mondays, or the next time the PC is on). Tool: E:\DanfosalApp\tools\paper-autopilot' `
    -Force | Out-Null
"Turned on: '$name' - Mondays at 09:00 and at every logon; files at most once a week."
"Log: C:\Danfosal\Reports\paper-autopilot\sweep.log"
