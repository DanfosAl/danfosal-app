' =============================================
' Silent launcher for DanfosalStartup.bat
'
' Runs the pipeline watchdog with NO visible window at all - not even a brief flash.
' A .bat launched directly (Startup shortcut or Task Scheduler "run only when user is
' logged on") always flashes a console window; wscript.exe is a windowed host that
' shows nothing, and Run(..., 0, False) starts cmd hidden and does not wait.
'
' Used by:
'   - Scheduled task "Danfosal EasyPOS Watchdog" (every 30 minutes)
'   - The single Startup-folder shortcut (at logon)
'
' /silent tells the batch file to skip its pauses and its 10s courtesy wait.
' =============================================

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
batPath = scriptDir & "\DanfosalStartup.bat"

q = Chr(34)

If objFSO.FileExists(batPath) Then
    ' Window style 0 = hidden, bWaitOnReturn = False
    objShell.Run q & batPath & q & " /silent", 0, False
End If

Set objShell = Nothing
Set objFSO = Nothing
