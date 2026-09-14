; Custom override for electron-builder's stock "is the app running" check.
;
; The stock check (see app-builder-lib's allowOnlyOneInstallerInstance.nsh) shells out to
; `cmd.exe /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ..." | find "..."`
; for per-user installs. That pipe-based check produced a false positive on this app on
; Aug 24, 2026 ("Danfosal App cannot be closed") even with zero matching processes running
; and the target exe confirmed unlocked by a direct rename test. This override replaces it
; with the same nsProcess plugin already used (and proven reliable) for per-machine installs,
; instead of hand-rolling the whole retry/messagebox flow.
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
