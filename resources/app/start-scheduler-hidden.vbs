Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d E:\DanfosalApp\resources\app && node weekly-report-scheduler.js", 0
Set WshShell = Nothing
