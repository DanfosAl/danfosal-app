# VS AGENT EXECUTION MANIFEST
## Project: EasyPOS Receipt Capture (EMF Spool → PNG) + Archive Feed  
**Goal:** EasyPOS prints to **PS80** as usual, and we **silently capture** each invoice as **PNG** (exact visual layout, QR codes, logos preserved) for Danfosal App OCR/archiving.  
**Fail-open:** Printing must work even if Danfosal app is closed.

---

## 0) Non-negotiable requirements  
1) **Do not change EasyPOS printing behavior**: it must print directly to PS80.  
2) **No virtual printers** (PDFCreator etc).  
3) **Capture must preserve exact layout** (we render EMF; we do not “decode” symbols).  
4) **No edits to Danfosal’s Black Box OCR system files** (`invoice-ocr.js`, `fiscal-invoice-scanner.js`, `store-invoice-scanner.js`).  
5) The agent must **notify Kushtrim** whenever a step requires manual UI clicks / admin UI operations; otherwise the agent should do everything via code/commands.

---

## 1) What the agent must build  
### Windows-only service: `Danfos.EasyPOS.PrintCaptureService`
Runs at Windows startup (Windows Service) and watches the Windows PrintService Operational log for successful prints from the PS80 printer. For each matching job:

- Copies spool files: `.SPL` (+ `.SHD` if present)
- Extracts EMF payload from SPL
- Renders EMF → PNG at thermal-friendly size (e.g. 576px width, 203–300 DPI)
- Saves to: `C:\Danfosal\Inbox\EasyPOS\`
- Writes metadata JSON sidecar
- Logs to: `C:\Danfosal\Logs\easypos-capture.log`

**Important:** The service must never re-print anything. It only mirrors/captures.

---

## 2) What the agent must NOT do  
- Must not set or rely on the Windows **Default Printer**  
- Must not “print again” (no re-printing pipeline, no PrintTo, no mspaint)  
- Must not block the spooler or slow printing  
- Must not modify existing Danfosal OCR “black box” modules  
- Must not install GUI middleware like PDFCreator

---

## 3) Required manual steps (agent must notify Kushtrim)
These are steps the agent cannot click reliably; Kushtrim must do them. The agent must stop and request confirmation.

### Manual Step A — Ensure EMF spooling is enabled  
**Printer Properties → Advanced → Print Processor**  
- Print processor: `WinPrint`  
- Default data type: **NT EMF 1.008**

### Manual Step B — Enable PrintService Operational Log  
**Event Viewer → Applications and Services Logs → Microsoft → Windows → PrintService → Operational**  
- Right-click **Operational** → **Enable Log**

### Manual Step C — Enable “Keep printed documents” (recommended during validation)  
**Printer Properties → Advanced**  
- ✅ Keep printed documents

Agent must message:  
> “Kushtrim: please perform Manual Step A/B/C now and confirm.”

---

## 4) Agent execution rules (how to work)
- Create a new isolated module folder: `tools/easypos-print-capture/`  
- Add a .NET solution + Worker Service project  
- Provide scripts:
  - `install-service.ps1`
  - `uninstall-service.ps1`
  - `debug-run.ps1`
- Implement a console debug mode (same binary can run interactively)  
- Target framework: `net8.0-windows`  
- Use Windows Event Log subscription (no polling loops if possible)  
- Implement idempotency (avoid duplicate capture): JobId + timestamp + SHA hash

---

## 5) When the agent MUST notify Kushtrim (intervention points)
1) Admin rights needed to install the service  
2) Confirm exact printer name (must match Control Panel printer display name)  
3) Enabling PrintService Operational log  
4) Spool folder permissions: read access to `C:\Windows\System32\spool\PRINTERS`  
5) Any driver setting changes (EMF vs RAW, advanced printing features)

If the agent can do it with commands, it should. If not, it must provide exact click-by-click instructions.

---

## 6) Acceptance tests (must pass)
1) **Fail-open:** Stop the service → EasyPOS still prints to PS80 normally.  
2) Start the service → printing still works, and each invoice produces:
   - PNG in `C:\Danfosal\Inbox\EasyPOS\`
   - JSON sidecar with jobId, timestamp, paths, hash  
3) PNG visually matches the printed invoice (QR/logo present, correct scaling).  
4) No duplicates from one print.

---

## 7) Deliverables checklist  
- ✅ Windows Service code (C# / .NET 8)  
- ✅ Installer/uninstaller scripts  
- ✅ Logs + diagnostics  
- ✅ Config file (printer name, output paths, width/DPI)  
- ✅ README runbook  
