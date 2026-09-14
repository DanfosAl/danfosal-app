param([string]$ServiceName = "DanfosEasyPOSCapture")
sc.exe stop $ServiceName
sc.exe delete $ServiceName
