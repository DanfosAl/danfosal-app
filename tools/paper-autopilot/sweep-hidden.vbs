' =============================================
' Silent launcher for the Paper Autopilot sweep
'
' Files new PDFs from Downloads into E:\Danfos Papers with no window at all, the same way
' run-startup-hidden.vbs starts the EasyPOS watchdog: wscript shows nothing, and Run(..., 0,
' False) starts node hidden without waiting. The sweep leaves anything downloaded in the last
' 15 minutes, writes a journal for every run that moved something, and logs each run to
' C:\Danfosal\Reports\paper-autopilot\sweep.log.
'
' Used by: scheduled task "Danfosal Paper Autopilot" (schedule-sweep.ps1), started at every
' logon and on Monday mornings. --weekly makes only the first start on or after a Monday do the
' work: the owner asked (26 Sep 2026) for filing every Monday, or when the PC is next turned on.
' =============================================

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
nodePath = "C:\Program Files\nodejs\node.exe"
q = Chr(34)

If objFSO.FileExists(nodePath) Then
    objShell.CurrentDirectory = scriptDir
    ' Window style 0 = hidden, bWaitOnReturn = False
    objShell.Run q & nodePath & q & " --disable-warning=MODULE_TYPELESS_PACKAGE_JSON " & q & scriptDir & "\autopilot.js" & q & " --sweep --weekly", 0, False
End If

Set objShell = Nothing
Set objFSO = Nothing
