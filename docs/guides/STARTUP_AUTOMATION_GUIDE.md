# Danfosal EasyPOS - Automatic Startup Configuration

## Overview
This guide explains how to configure the Danfosal EasyPOS system to start automatically when Windows boots, ensuring the Print-to-ERP pipeline is always active without manual intervention.

## Created Files

### 1. DanfosalStartup.bat
**Location:** `E:\DanfosalApp\DanfosalStartup.bat`

**What it does:**
- ✅ Checks if Print Capture Service (Windows Service) is running
- ✅ Starts the service if stopped (requires admin rights if not installed)
- ✅ Verifies Node.js is available
- ✅ Starts the OCR Bridge in a minimized window
- ✅ Logs all activities to `C:\Danfosal\Logs\startup.log`
- ✅ Prevents duplicate instances

## Installation Steps

### Option 1: User Startup (Recommended - No Admin Required)

**Run as current user when you log in:**

1. **Open Windows Startup Folder**
   ```
   Press: Win + R
   Type: shell:startup
   Press: Enter
   ```

2. **Create Shortcut**
   - Right-click in the Startup folder
   - Select: New → Shortcut
   - Browse to: `E:\DanfosalApp\DanfosalStartup.bat`
   - Name it: "Danfosal EasyPOS Pipeline"
   - Click Finish

3. **Configure Shortcut (Optional)**
   - Right-click the shortcut → Properties
   - Change "Run:" to **Minimized**
   - Click OK

**Result:** Services start automatically when you log in.

---

### Option 2: All Users Startup (Requires Admin)

**Run for ALL users on the PC:**

1. **Open All Users Startup Folder**
   ```
   Press: Win + R
   Type: shell:common startup
   Press: Enter
   ```
   
   *If blocked, manually navigate to:*
   ```
   C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup
   ```

2. **Create Shortcut** (same as Option 1)
   - Copy `DanfosalStartup.bat` shortcut to this folder

**Result:** Services start for any user who logs in.

---

### Option 3: Windows Service Only (Production)

**For the Print Capture Service (C# component):**

The service is already configured to start automatically if installed properly.

**To verify/configure:**

1. **Open Services**
   ```
   Press: Win + R
   Type: services.msc
   Press: Enter
   ```

2. **Find Service**
   - Locate: "Danfos EasyPOS Receipt Capture Service"
   - Double-click to open properties

3. **Configure Startup**
   - Startup type: **Automatic**
   - Service status: **Running**
   - Click: Apply → OK

4. **OCR Bridge as Windows Service** (Optional)

   For production, convert the Node.js bridge to a Windows Service using `node-windows`:

   ```powershell
   cd E:\DanfosalApp\resources\app
   npm install -g node-windows
   ```

   Then create a service installer script (see EASYPOS_BRIDGE_SETUP.md for details).

---

## Testing the Startup Script

### Test Manually

1. **Run the batch file:**
   ```
   E:\DanfosalApp\DanfosalStartup.bat
   ```

2. **Expected output:**
   ```
   ========================================
     Danfosal EasyPOS Pipeline Startup
   ========================================
   [1/3] Checking Print Capture Service...
         Service is installed.
         Status: Already RUNNING
   
   [2/3] Checking Node.js...
         Node.js found
   
   [3/3] Starting OCR Bridge...
         Starting OCR Bridge in new window...
         SUCCESS: OCR Bridge started
   
   ========================================
     All services started successfully!
   ========================================
   ```

3. **Verify services are running:**
   ```powershell
   # Check Print Capture Service
   Get-Process -Name "Danfos.EasyPOS.PrintCaptureService"
   
   # Check OCR Bridge
   Get-Process -Name "node" | Where-Object {$_.MainWindowTitle -like "*EasyPOS*"}
   ```

### Test on Restart

1. **Add shortcut to Startup folder** (see Option 1 above)
2. **Restart your PC**
3. **After login, check:**
   - Look for startup window (auto-closes after 10 seconds)
   - Check `C:\Danfosal\Logs\startup.log`
   - Verify both services are running (use PowerShell commands above)

---

## Startup Log Location

**Log File:** `C:\Danfosal\Logs\startup.log`

**Sample log content:**
```
[07/02/2026 08:15:23] Startup script initiated
[07/02/2026 08:15:23] Service 'DanfosEasyPOSCapture' is installed
[07/02/2026 08:15:23] Service already running
[07/02/2026 08:15:24] Node.js available
[07/02/2026 08:15:24] OCR Bridge started successfully
[07/02/2026 08:15:24] Startup complete
```

**Check logs:**
```powershell
Get-Content C:\Danfosal\Logs\startup.log -Tail 20
```

---

## Troubleshooting

### Issue: "Failed to start service"

**Cause:** Service requires administrator privileges to start.

**Solutions:**
1. Install the service properly: Run `install-service.ps1` as Administrator
2. Or run the batch file as Administrator (right-click → Run as administrator)
3. Or configure service to start automatically (it will start on next boot)

---

### Issue: "Node.js not found in PATH"

**Cause:** Node.js not installed or not in system PATH.

**Solutions:**
1. Install Node.js: https://nodejs.org/
2. Restart PC after installation
3. Or add Node.js to PATH manually:
   ```
   C:\Program Files\nodejs
   ```

---

### Issue: OCR Bridge starts multiple times

**Cause:** Multiple startup entries or manual starts.

**Solution:**
- Script includes duplicate detection
- Check for multiple shortcuts in Startup folder
- Kill extra processes:
  ```powershell
  Get-Process -Name "node" | Where-Object {$_.MainWindowTitle -like "*EasyPOS*"} | Stop-Process
  ```

---

### Issue: Services don't start on boot

**Checklist:**
- ✅ Shortcut is in correct Startup folder
- ✅ Batch file path is correct (not moved)
- ✅ User has permissions to access E:\DanfosalApp
- ✅ Node.js is installed and in PATH
- ✅ Check startup log for errors

---

## System Architecture After Setup

```
Windows Boot
    ↓
User Login
    ↓
Windows Startup Folder
    ↓
DanfosalStartup.bat (runs automatically)
    ↓
    ├─→ Check/Start Print Capture Service (Windows Service)
    │   └─→ Monitors: PrintService Event ID 307
    │       └─→ Captures: PNG + JSON → C:\Danfosal\Inbox\EasyPOS\
    │
    └─→ Start OCR Bridge (Node.js)
        └─→ Watches: C:\Danfosal\Inbox\EasyPOS\*.json
            └─→ Processes: OCR → Extract Data → Database
                └─→ Archives: Processed\ folder
```

**Result:** Fully automated Print-to-ERP pipeline, zero manual intervention required!

---

## Security Considerations

### User Permissions
- Print Capture Service: Requires access to `C:\Windows\System32\spool\PRINTERS`
- OCR Bridge: Requires read/write to `C:\Danfosal\`
- Both: Should run under user account with appropriate permissions

### Production Hardening
1. Run Print Capture Service under dedicated service account
2. Configure least-privilege permissions for Danfosal folders
3. Enable Windows Firewall rules if remote access needed
4. Regular backup of `C:\Danfosal\Inbox\EasyPOS\Processed\`

---

## Uninstall/Disable Startup

### Remove from Startup

1. **Open Startup folder:**
   ```
   Win + R → shell:startup
   ```

2. **Delete the shortcut:**
   - Find "Danfosal EasyPOS Pipeline"
   - Delete it

3. **Or disable via Task Manager:**
   ```
   Ctrl + Shift + Esc → Startup tab
   Find "Danfosal EasyPOS Pipeline"
   Right-click → Disable
   ```

### Stop Services Manually
```powershell
# Stop Print Capture Service
net stop "DanfosEasyPOSCapture"

# Stop OCR Bridge
Get-Process -Name "node" | Where-Object {$_.MainWindowTitle -like "*EasyPOS*"} | Stop-Process
```

---

## Summary

| Component | Startup Method | Status |
|-----------|---------------|--------|
| Print Capture Service | Windows Service (Automatic) | ✅ Configured |
| OCR Bridge | Batch Script (shell:startup) | ✅ Ready |
| Startup Automation | DanfosalStartup.bat | ✅ Created |
| Startup Logging | C:\Danfosal\Logs\startup.log | ✅ Active |

**Next Step:** Add the shortcut to your Startup folder and test with a system restart!

---

## Quick Reference Commands

```powershell
# Check if services are running
Get-Process -Name "Danfos.EasyPOS.PrintCaptureService"
Get-Process -Name "node" | Where-Object {$_.MainWindowTitle -like "*EasyPOS*"}

# View startup log
Get-Content C:\Danfosal\Logs\startup.log -Tail 20

# Open startup folder
explorer shell:startup

# Test startup script manually
E:\DanfosalApp\DanfosalStartup.bat
```

---

**Your EasyPOS Print-to-ERP pipeline is now fully automated!** 🚀
