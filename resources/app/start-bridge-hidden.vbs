' =============================================
' Silent launcher for EasyPOS OCR Bridge
' Runs PowerShell completely hidden (no taskbar)
' =============================================

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")

' Get the directory of this script
scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Build PowerShell command to run npm bridge
psCommand = "Set-Location '" & scriptDir & "'; npm run bridge"

' Run PowerShell completely hidden (WindowStyle 0 = hidden, no taskbar icon)
objShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command """ & psCommand & """", 0, False

Set objShell = Nothing
Set objFSO = Nothing
