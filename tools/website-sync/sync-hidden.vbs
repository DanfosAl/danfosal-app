' =============================================
' Silent launcher for the website sync
'
' Runs website-sync.mjs with no window, the same way sweep-hidden.vbs starts the Paper Autopilot:
' wscript shows nothing, and Run(..., 0, False) starts node hidden without waiting. --daily makes
' only the first successful run of the day do the work (the task also starts at logon, for a PC
' that was off at 07:30). Log: C:\Danfosal\Reports\website-sync\website-sync.log
'
' Used by: scheduled task "Danfosal Website Sync" (schedule-sync.ps1).
' =============================================

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
nodePath = "C:\Program Files\nodejs\node.exe"
q = Chr(34)

If objFSO.FileExists(nodePath) Then
    objShell.CurrentDirectory = scriptDir
    ' Window style 0 = hidden, bWaitOnReturn = False
    objShell.Run q & nodePath & q & " " & q & scriptDir & "\website-sync.mjs" & q & " --daily", 0, False
End If

Set objShell = Nothing
Set objFSO = Nothing
