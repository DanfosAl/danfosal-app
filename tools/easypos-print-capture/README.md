# Danfos EasyPOS Print Capture Service

A Windows Service that captures EasyPOS print jobs and converts them to PNG images for OCR processing.

## Overview

This service monitors the Windows PrintService event log and captures print jobs from the PS80 printer. It:

1. Listens for PrintService Event ID 307 (Document printed)
2. Copies spool files (.SPL) from the Windows spooler
3. Extracts EMF (Enhanced Metafile) payloads
4. Renders EMF to PNG at thermal-friendly resolution (576px width @ 300 DPI)
5. Saves metadata JSON for each captured receipt

## Prerequisites

- Windows OS
- .NET 8.0 Runtime (or SDK for development)
- Administrator privileges for service installation
- PrintService Operational log enabled in Event Viewer

## Configuration

Edit `appsettings.json` to configure:

```json
{
  "Capture": {
    "PrinterName": "PS80_REAL",          // Printer name to monitor
    "SpoolDir": "C:\\Windows\\System32\\spool\\PRINTERS",
    "OutDir": "C:\\Danfosal\\Inbox\\EasyPOS",
    "RawDir": "C:\\Danfosal\\Inbox\\EasyPOS\\Raw",
    "LogFile": "C:\\Danfosal\\Logs\\easypos-capture.log",
    "PngWidthPx": 576,                    // Output PNG width
    "Dpi": 300,                            // DPI for rendering
    "StabilityDelayMs": 600                // Wait time for spool file stability
  }
}
```

## Manual Setup Steps (REQUIRED)

### 1. Enable EMF Spooling
- Open **Printer Properties** → **Advanced** → **Print Processor**
- Set Print processor to: `WinPrint`
- Set Default data type to: `NT EMF 1.008`

### 2. Enable PrintService Operational Log
- Open **Event Viewer**
- Navigate to: **Applications and Services Logs** → **Microsoft** → **Windows** → **PrintService** → **Operational**
- Right-click **Operational** → **Enable Log**

### 3. Enable "Keep printed documents" (Recommended for validation)
- Open **Printer Properties** → **Advanced**
- Check ✅ **Keep printed documents**

## Installation

### Debug Mode (Console)
```powershell
.\scripts\debug-run.ps1
```

### Windows Service (Production)
**Requires Administrator privileges:**
```powershell
.\scripts\install-service.ps1
```

To uninstall:
```powershell
.\scripts\uninstall-service.ps1
```

## Output Structure

```
C:\Danfosal\Inbox\EasyPOS\
  Receipt_20260207_143052_00123.png      # Rendered PNG image
  Receipt_20260207_143052_00123.json     # Metadata
  Failed\                                 # Failed captures
  Raw\
    Receipt_20260207_143052_00123.spl    # Original spool file
    Receipt_20260207_143052_00123.emf    # Extracted EMF
```

## Validation

1. Start the service (debug or installed)
2. Print an invoice from EasyPOS to PS80
3. Check output in `C:\Danfosal\Inbox\EasyPOS\`
4. Verify PNG shows QR code, logo, and correct layout
5. Stop service and verify printing still works (fail-open)

## Architecture

```
Worker.cs (EventLogWatcher)
  └─> Monitors PrintService EventID 307
      └─> SpoolJobLocator.cs
          ├─> Waits for spool file stability
          ├─> EmfExtractor.cs (extracts EMF from SPL)
          └─> EmfRenderer.cs (renders EMF to PNG)
```

## Important Notes

- **Fail-open design**: Printing works normally even if service is stopped
- **No re-printing**: Service only captures/mirrors, never re-prints
- **Robust file handling**: Handles spaces in paths and file locks
- **No OCR modification**: Does not touch existing Danfosal OCR black box files

## Troubleshooting

- **No captures**: Check PrintService log is enabled and printer name matches
- **Empty PNGs**: Verify EMF spooling is enabled in printer settings
- **File locks**: Increase `StabilityDelayMs` in appsettings.json
- **Service won't start**: Run as Administrator and check Event Viewer logs
