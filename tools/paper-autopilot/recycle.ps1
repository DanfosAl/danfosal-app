# Sends files to the Recycle Bin (restorable), never deletes them. Called by apply.js with a
# UTF-8 text file of full paths, one per line; prints "ok<TAB>n" or "err<TAB>n<TAB>code" for the
# n-th path. Positions, not paths, because Windows PowerShell's output mangles names like
# "Kärcher" and "Ofertë". Plain lines, not JSON: Windows PowerShell's ConvertFrom-Json returns a
# list as one object, which once glued 77 paths into a single invalid one (error 124).
#
# SHFileOperation with FOF_ALLOWUNDO is what Explorer's Delete key does. The flags also keep it
# from showing any dialog, which matters when it runs hidden from Task Scheduler.
param([Parameter(Mandatory = $true)][string]$ListPath)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DanfosRecycle {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SHFILEOPSTRUCT {
        public IntPtr hwnd; public uint wFunc; public string pFrom; public string pTo;
        public ushort fFlags; public bool fAnyOperationsAborted; public IntPtr hNameMappings; public string lpszProgressTitle;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    static extern int SHFileOperation(ref SHFILEOPSTRUCT op);
    // FO_DELETE = 3; FOF_SILENT 0x4 | FOF_NOCONFIRMATION 0x10 | FOF_ALLOWUNDO 0x40 | FOF_NOERRORUI 0x400
    public static int Send(string path) {
        var op = new SHFILEOPSTRUCT { wFunc = 3, pFrom = path + "\0\0", fFlags = 0x4 | 0x10 | 0x40 | 0x400 };
        return SHFileOperation(ref op);
    }
}
"@

[string[]]$paths = @(Get-Content -Encoding UTF8 -LiteralPath $ListPath | Where-Object { $_ -ne '' })
for ($i = 0; $i -lt $paths.Count; $i++) {
    $p = $paths[$i]
    $code = [DanfosRecycle]::Send($p)
    if ($code -eq 0 -and -not (Test-Path -LiteralPath $p)) { "ok`t$i" } else { "err`t$i`t$code" }
}
