# Quick Start: Transfer App to Work PC

## What You Have
- **Windows App**: Fully working desktop app with auto-update
- **Location**: `release-build\danfosal-app-win32-x64\`

## Steps to Transfer to Work PC

### 1. Prepare the Package (On Laptop)

```powershell
# Create a distributable ZIP
Compress-Archive -Path "release-build\danfosal-app-win32-x64" -DestinationPath "danfosal-app-windows-v1.2.0.zip" -Force
```

### 2. Transfer Methods

**Option A: USB Drive**
- Copy `danfosal-app-windows-v1.2.0.zip` to USB
- Plug into work PC

**Option B: Cloud Storage**
- Upload to Google Drive / OneDrive
- Download on work PC

**Option C: Network Share**
- Copy to shared network folder
- Access from work PC

### 3. Install on Work PC

1. **Extract the ZIP**
   - Right-click → Extract All
   - Choose location (e.g., `C:\Program Files\Danfosal` or Desktop)

2. **Run the App**
   - Double-click `Launch Danfosal App.bat`
   - OR double-click `danfosal-app.exe`

3. **Done!** App is now running and will check for updates automatically.

## Auto-Update System Active

✅ **Automatic Update Checks**:
- Checks every hour for new versions
- Shows notification when update is available
- One-click download

✅ **How Updates Work**:
1. You push update from laptop (see AUTO_UPDATE_GUIDE.md)
2. Work PC checks Firebase Storage
3. Finds new version and shows dialog
4. User clicks "Download"
5. New installer downloads
6. User runs installer to update

## First Update Test

### On Laptop:
```powershell
# Increment version and deploy
.\deploy-updates.ps1 -Version "1.2.1" -ReleaseNotes "Testing auto-update system"

# Then upload to Firebase Storage:
# - update-manifest.json
# - Android APK (if needed)
```

### On Work PC:
1. Restart the Danfosal app
2. Wait 3 seconds for update check
3. Should see "Update Available" dialog
4. Click "Download" to test

## No Internet? No Problem!
- App works completely offline
- Data stored locally
- Updates only when online

## App Size
- **Compressed**: ~120 MB (zip file)
- **Installed**: ~200 MB (extracted)

## Backup Your Data
- Firebase data syncs automatically
- Local data in browser storage
- No data loss when updating

## Need Help?
- Check AUTO_UPDATE_GUIDE.md for detailed docs
- Update system logs to console (F12 → Console)
