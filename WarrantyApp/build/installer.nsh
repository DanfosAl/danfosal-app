; Custom override for electron-builder's stock "is the app running" check.
;
; The stock check (see app-builder-lib's allowOnlyOneInstallerInstance.nsh) shells out to
; `cmd.exe /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ..." | find "..."`
; for per-user installs — a fragile pipe-based check that produced a false-positive
; "app cannot be closed" error on the main Danfosal App installer (Aug 24, 2026). Reusing
; the same fix here pre-emptively: the nsProcess-based check already proven reliable there.
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    DetailPrint `Closing running "${PRODUCT_NAME}"...`
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1000

    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 500
    ${endIf}
  ${endIf}
  ${nsProcess::Unload}
!macroend
