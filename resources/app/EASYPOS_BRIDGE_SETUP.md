# EasyPOS OCR Bridge - Setup Guide

## Overview
The EasyPOS OCR Bridge connects the .NET Print Capture Service to your existing OCR subsystem, creating a fully automated data flow from printer to database without modifying the OCR core files.

## Architecture
```
EasyPOS (Printing)
    ↓
Windows Spooler (EMF)
    ↓
.NET Print Capture Service (C#) → PNG + JSON files
    ↓
C:\Danfosal\Inbox\EasyPOS\
    ↓
EasyPOS OCR Bridge (Node.js) ← YOU ARE HERE
    ↓
OCR Processing (Tesseract)
    ↓
Database / ERP Integration
```

## Installation Complete ✓

Dependencies installed:
- ✅ `chokidar` v4.0.3 - File system watcher
- ✅ `fs-extra` v11.2.0 - Enhanced file operations
- ✅ `tesseract.js` v5.1.1 - OCR engine (Node.js)

## Directory Structure
```
C:\Danfosal\
├── Inbox\
│   └── EasyPOS\
│       ├── Receipt_*.png          ← New receipts appear here
│       ├── Receipt_*.json         ← Metadata
│       ├── Processed\             ← Successfully processed
│       ├── Failed\                ← Failed processing attempts
│       └── Raw\                   ← Original SPL/EMF files
└── Logs\
    └── easypos-ocr-bridge.log    ← Bridge activity log
```

## Usage

### Start the Bridge
```powershell
cd E:\DanfosalApp\resources\app
npm run bridge
```

Or directly:
```powershell
node easypos-ocr-bridge.js
```

### What Happens Automatically
1. **Watch**: Bridge monitors `C:\Danfosal\Inbox\EasyPOS\` for new `.json` files
2. **Detect**: When `.json` appears, finds corresponding `.png`
3. **Process**: Runs OCR on the PNG image
4. **Extract**: Parses invoice data (number, date, total, items)
5. **Save**: Stores data to database/JSON
6. **Archive**: Moves files to `Processed\` folder

## Integration with Existing System

### Database Integration (TODO - Customize)
Edit `easypos-ocr-bridge.js` at line ~169:

```javascript
async saveToDatabase(invoiceData) {
    // Replace this with your actual database integration
    const db = require('./your-db-module');
    await db.insertInvoice(invoiceData);
}
```

### Custom Invoice Format
Customize extraction methods for your EasyPOS receipt format:
- `findInvoiceNumber()` - Line ~139
- `findDate()` - Line ~148
- `findTotal()` - Line ~157
- `extractItems()` - Line ~168

## Testing

### 1. Print a Test Receipt
Print an invoice from EasyPOS to POS80_REAL while both services are running:
- ✅ .NET Print Capture Service (should already be running)
- ✅ EasyPOS OCR Bridge (start with `npm run bridge`)

### 2. Monitor Activity
Watch the terminal for processing logs:
```
[2026-02-07T...] [INFO] New file detected: Receipt_20260207_193000_00012.json
[2026-02-07T...] [INFO] Processing: Receipt_20260207_193000_00012
[2026-02-07T...] [INFO] Running OCR on Receipt_20260207_193000_00012...
[2026-02-07T...] [INFO] Database entry created: ...
[2026-02-07T...] [SUCCESS] ✓ Successfully processed: Receipt_20260207_193000_00012
```

### 3. Check Results
- **Success**: Files moved to `C:\Danfosal\Inbox\EasyPOS\Processed\`
- **Failure**: Files moved to `C:\Danfosal\Inbox\EasyPOS\Failed\` with error log

## Running Both Services Together

### Terminal 1 - Print Capture Service
```powershell
cd E:\DanfosalApp\tools\easypos-print-capture
.\scripts\debug-run.ps1
```

### Terminal 2 - OCR Bridge
```powershell
cd E:\DanfosalApp\resources\app
npm run bridge
```

### Terminal 3 - File Watcher (Optional)
```powershell
cd E:\DanfosalApp\tools\easypos-print-capture
.\scripts\watch-captures.ps1
```

## Production Deployment

### Option 1: Windows Service (Recommended)
Convert the bridge to a Windows Service using `node-windows`:
```bash
npm install -g node-windows
# Then create a service wrapper
```

### Option 2: Windows Task Scheduler
Create a scheduled task that runs on system startup:
- Program: `node.exe`
- Arguments: `E:\DanfosalApp\resources\app\easypos-ocr-bridge.js`
- Start in: `E:\DanfosalApp\resources\app`

### Option 3: PM2 Process Manager
```bash
npm install -g pm2
pm2 start easypos-ocr-bridge.js --name easypos-bridge
pm2 startup  # Configure to start on boot
pm2 save
```

## Troubleshooting

### Bridge Not Processing Files
1. Check if bridge is running: Look for "Bridge is running" message
2. Verify directory permissions: Ensure read/write access to `C:\Danfosal\`
3. Check logs: `C:\Danfosal\Logs\easypos-ocr-bridge.log`

### OCR Failures
1. Verify PNG quality: Open PNG manually, ensure it's readable
2. Check Tesseract: OCR works best with clear, high-contrast text
3. Adjust DPI: Edit Print Capture Service `appsettings.json` (currently 300 DPI)

### Files Stuck in Failed Folder
1. Check error log in Failed folder: `Receipt_*.error.txt`
2. Manually review PNG: Is text readable?
3. Adjust extraction patterns in bridge code

## Configuration

Edit `easypos-ocr-bridge.js` at the top:

```javascript
const CONFIG = {
    watchDir: 'C:\\Danfosal\\Inbox\\EasyPOS',
    processedDir: 'C:\\Danfosal\\Inbox\\EasyPOS\\Processed',
    failedDir: 'C:\\Danfosal\\Inbox\\EasyPOS\\Failed',
    logFile: 'C:\\Danfosal\\Logs\\easypos-ocr-bridge.log',
};
```

## Next Steps

1. ✅ Dependencies installed
2. ✅ Bridge created and ready
3. ⏳ **Test with real receipt** (print from EasyPOS)
4. ⏳ **Customize data extraction** for your receipt format
5. ⏳ **Integrate with database** (replace saveToDatabase method)
6. ⏳ **Deploy as Windows Service** for production

## Support

- Print Capture logs: `C:\Danfosal\Logs\easypos-capture.log`
- Bridge logs: `C:\Danfosal\Logs\easypos-ocr-bridge.log`
- Failed attempts: `C:\Danfosal\Inbox\EasyPOS\Failed\`

---

**Status**: ✅ Ready to test with live receipts!
