@echo off
REM =============================================
REM Danfosal EasyPOS Auto-Startup Script
REM Ensures the Print Capture Service and OCR Bridge are running.
REM Weekly report scheduler removed 14.09.2026 (no longer wanted).
REM Safe to run repeatedly - every start is guarded, so nothing is duplicated.
REM Pass /silent when running unattended (scheduled task): no pauses, no final wait.
REM =============================================

echo.
echo ========================================
echo   Danfosal EasyPOS Pipeline Startup
echo ========================================
echo [%date% %time%] Starting services...
echo.

REM Set paths
set SERVICE_NAME=DanfosEasyPOSCapture
set APP_DIR=E:\DanfosalApp\resources\app
set LOG_DIR=C:\Danfosal\Logs
set LOG_FILE=%LOG_DIR%\startup.log

REM Ensure log directory exists
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Log startup attempt
echo [%date% %time%] Startup script initiated >> "%LOG_FILE%"

REM ==========================================
REM Step 1: Check Print Capture Service
REM ==========================================
echo [1/3] Checking Print Capture Service...
sc query "%SERVICE_NAME%" > nul 2>&1

REM NOTE: uses "if errorlevel N" (evaluated at run time) rather than "%ERRORLEVEL%"
REM (expanded once when the whole parenthesised block is parsed). The old version used
REM the latter, so the nested checks compared a stale value and the log recorded both
REM "Service is installed" and "Service not installed, skipping" on the same run -
REM contradictory noise that actively misleads when diagnosing this pipeline.
if errorlevel 1 (
    echo       WARNING: Service not installed ^(run install-service.ps1 first^)
    echo       Falling back to debug mode...
    echo [%date% %time%] Service not installed, skipping >> "%LOG_FILE%"
    goto :service_done
)

echo       Service is installed.
echo [%date% %time%] Service '%SERVICE_NAME%' is installed >> "%LOG_FILE%"

REM Check if service is running
sc query "%SERVICE_NAME%" | find "RUNNING" > nul

if not errorlevel 1 (
    echo       Status: Already RUNNING
    echo [%date% %time%] Service already running >> "%LOG_FILE%"
    goto :service_done
)

echo       Status: STOPPED - Starting now...
echo [%date% %time%] Attempting to start service >> "%LOG_FILE%"

net start "%SERVICE_NAME%" > nul 2>&1

if errorlevel 1 (
    echo       WARNING: Failed to start service ^(may require admin rights^)
    echo [%date% %time%] Failed to start service >> "%LOG_FILE%"
) else (
    echo       SUCCESS: Service started
    echo [%date% %time%] Service started successfully >> "%LOG_FILE%"
)

:service_done

echo.

REM ==========================================
REM Step 2: Check Node.js availability
REM ==========================================
echo [2/3] Checking Node.js...

where node > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       ERROR: Node.js not found in PATH
    echo       Please install Node.js or ensure it's in PATH
    echo [%date% %time%] Node.js not found in PATH >> "%LOG_FILE%"
    REM Never pause when unattended - a hidden process blocked on "pause" would sit
    REM there forever and pile up a new stuck copy every 30 minutes.
    if /i not "%~1"=="/silent" pause
    exit /b 1
) else (
    echo       Node.js found
    echo [%date% %time%] Node.js available >> "%LOG_FILE%"
)

echo.

REM ==========================================
REM Step 3: Start OCR Bridge
REM ==========================================
echo [3/3] Starting OCR Bridge...

if not exist "%APP_DIR%\easypos-ocr-bridge.js" (
    echo       ERROR: Bridge script not found at %APP_DIR%
    echo [%date% %time%] Bridge script not found >> "%LOG_FILE%"
    if /i not "%~1"=="/silent" pause
    exit /b 1
)

REM Check if the OCR Bridge SPECIFICALLY is running.
REM The old check matched ANY node.exe, so unrelated node processes (the weekly report
REM scheduler, Vite, editor tooling) made it always report "already running" and the
REM bridge silently never started - it stopped on 10.09.2026 and every startup since
REM skipped it while EasyPOS receipts piled up unprocessed in the Inbox.
set BRIDGE_COUNT=0
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "@(Get-CimInstance Win32_Process).Where({ $_.Name -eq 'node.exe' -and $_.CommandLine -like '*easypos-ocr-bridge.js*' }).Count"`) do set BRIDGE_COUNT=%%P

if "%BRIDGE_COUNT%"=="0" goto :bridge_start

REM Running - but is it running the CURRENT code? The bridge is not part of the installer
REM (see Golden Manifest Finding #21): it runs from this source tree, so editing the script
REM changes nothing until the process is restarted. On 14.09.2026 the live process silently
REM ran a version older than the file for half an hour. BRIDGE_STALE=1 means the script has
REM been edited since the process started, so restart it and pick up the new code by itself.
REM
REM Only restarts while the Inbox is empty, so a receipt is never interrupted mid-OCR. Even
REM if one were, nothing is lost: an unfinished receipt stays in the Inbox and is reprocessed
REM on the next start, and if it had already been saved the reprint guard skips it instead of
REM creating a second sale.
REM
REM Written with GOTO rather than an if/else block on purpose: %VAR% inside a parenthesised
REM block expands when the block is parsed, so reading BRIDGE_STALE there needs delayed
REM expansion - which would in turn eat the "!" in this script's own echo lines.
set BRIDGE_STALE=0
for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "$p=@(Get-CimInstance Win32_Process).Where({ $_.Name -eq 'node.exe' -and $_.CommandLine -like '*easypos-ocr-bridge.js*' })[0]; $f=Get-Item '%APP_DIR%\easypos-ocr-bridge.js'; $busy=@(Get-ChildItem 'C:\Danfosal\Inbox\EasyPOS' -File -Filter *.json -ErrorAction SilentlyContinue).Count; if ($p -and $f.LastWriteTime -gt $p.CreationDate -and $busy -eq 0) { 1 } else { 0 }"`) do set BRIDGE_STALE=%%S

if "%BRIDGE_STALE%"=="1" goto :bridge_restart

echo       OCR Bridge already running
echo [%date% %time%] OCR Bridge already running ^(%BRIDGE_COUNT% instance^(s^)^) >> "%LOG_FILE%"
goto :bridge_done

:bridge_restart
echo       OCR Bridge is running OLD code - restarting to pick up changes...
echo [%date% %time%] OCR Bridge stale ^(script newer than process^) - restarting >> "%LOG_FILE%"
powershell -NoProfile -Command "@(Get-CimInstance Win32_Process).Where({ $_.Name -eq 'node.exe' -and $_.CommandLine -like '*easypos-ocr-bridge.js*' }) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" > nul 2>&1
ping -n 3 127.0.0.1 > nul

:bridge_start
echo       Starting OCR Bridge ^(hidden mode^)...
echo [%date% %time%] Starting OCR Bridge... >> "%LOG_FILE%"
cd /d "%APP_DIR%"

REM Start completely hidden using VBScript launcher
cscript //nologo "%APP_DIR%\start-bridge-hidden.vbs" >> "%LOG_FILE%" 2>&1

REM ~3s wait. Uses ping rather than timeout: timeout aborts with "Input redirection is
REM not supported" whenever this script's output is redirected (e.g. Task Scheduler),
REM which would skip the wait and make the verification below report a false warning.
ping -n 4 127.0.0.1 > nul

REM Verify it started - again matching the bridge script itself, not any node.exe,
REM so a genuine startup failure is actually reported instead of silently passing.
set BRIDGE_COUNT=0
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "@(Get-CimInstance Win32_Process).Where({ $_.Name -eq 'node.exe' -and $_.CommandLine -like '*easypos-ocr-bridge.js*' }).Count"`) do set BRIDGE_COUNT=%%P

if not "%BRIDGE_COUNT%"=="0" (
    echo       SUCCESS: OCR Bridge started ^(running silently^)
    echo [%date% %time%] OCR Bridge started successfully >> "%LOG_FILE%"
) else (
    echo       WARNING: OCR Bridge may not have started
    echo [%date% %time%] WARNING: OCR Bridge verification failed >> "%LOG_FILE%"
)

:bridge_done

echo.

REM ==========================================
REM Weekly Report Scheduler - REMOVED 14.09.2026
REM ==========================================
REM The owner no longer wants the weekly reports, so this script no longer starts
REM weekly-report-scheduler.js. The script file itself is left on disk (unused) in
REM case it is ever wanted again; nothing launches it automatically any more.

echo.
echo ========================================
echo   All services started successfully!
echo ========================================
echo [%date% %time%] Startup complete >> "%LOG_FILE%"

REM When run unattended (scheduled task passes /silent) exit immediately - there is no
REM window for anyone to read, so the 10s courtesy pause would just leave a hidden
REM process lingering every 30 minutes.
if /i "%~1"=="/silent" exit /b 0

echo.
echo You can safely close this window.
echo The services will continue running in the background.
echo.

REM Auto-close after ~10 seconds
ping -n 11 127.0.0.1 > nul
exit
