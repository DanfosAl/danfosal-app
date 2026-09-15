# Auto-Update System Setup Guide

## Overview
Your Danfosal App now has automatic update checking for both Windows and Android platforms.

## How It Works

### For Windows Desktop App
- The app checks for updates every hour automatically
- When a new version is available, it shows a dialog
- Users can download the new installer directly
- No restart required for checking (only for installing)

### For Android App
- The app checks for updates every hour
- When available, shows update dialog with release notes
- Taps "Update Now" to download new APK
- User must manually install the downloaded APK

### For Web App
- Always gets latest version when you refresh
- Deployed via Firebase Hosting

## Update Deployment Process

### From Your Laptop (Development):

1. **Prepare New Version**
   ```powershell
   .\deploy-updates.ps1 -Version "1.2.1" -ReleaseNotes "Fixed bug in analytics"
   ```

2. **This Script Will:**
   - Update version in package.json
   - Update Android version code
   - Build new Android APK
   - Update Windows app files
   - Deploy web app to Firebase
   - Create update manifest

3. **Manual Steps (Firebase Console)**
   - Go to: https://console.firebase.google.com/project/danfosal-app/storage
   - Create folder structure: `updates/android/` and `updates/windows/`
   - Upload `update-manifest.json` → `updates/update-manifest.json`
   - Upload `releases/android/danfosal-app-{version}.apk` → `updates/android/`
   - Zip and upload Windows folder (if needed)

### On Work PC (Testing):

1. **Initial Setup**
   - Download and extract Windows app to any location
   - Run `danfosal-app.exe` or use `Launch Danfosal App.bat`
   - App is now installed and will check for updates

2. **When Update is Available**
   - App will show notification after startup
   - Click "Download" to get new installer
   - Run the new installer to update

## File Structure

```
E:\danfosal-app\
├── update-manifest.json      # Update configuration
├── deploy-updates.ps1         # Deployment script
├── public/
│   ├── app-updater.js        # Cross-platform updater
│   └── app-version.json      # Version info
├── main.js                    # Windows updater logic
├── preload.js                 # Electron IPC bridge
└── releases/
    ├── android/
    │   └── danfosal-app-{version}.apk
    └── windows/
        └── danfosal-app-{version}/
```

## Update Manifest Structure

```json
{
  "version": "1.2.0",
  "windows": {
    "version": "1.2.0",
    "url": "https://firebasestorage...",
    "releaseDate": "2025-11-09",
    "releaseNotes": "What's new",
    "mandatory": false,
    "size": 200000000
  },
  "android": {
    "version": "1.2.0",
    "versionCode": 10200,
    "url": "https://firebasestorage...",
    "releaseDate": "2025-11-09",
    "releaseNotes": "What's new",
    "mandatory": false,
    "size": 1200000
  }
}
```

## Testing Updates

### Test on Work PC:

1. **Copy current Windows app** to work PC
2. **Run the app** - it should work normally
3. **On laptop:** Run `deploy-updates.ps1` with new version
4. **Upload files** to Firebase Storage
5. **On work PC:** Wait up to 1 hour (or restart app to check immediately)
6. **Verify** update notification appears

### Test Android Updates:

1. **Install current APK** on phone
2. **Deploy new version** from laptop
3. **Open app** on phone
4. **Wait or restart** app
5. **Update notification** should appear

## Version Numbering

Use semantic versioning: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes (1.x.x → 2.x.x)
- **MINOR**: New features (1.0.x → 1.1.x)
- **PATCH**: Bug fixes (1.0.0 → 1.0.1)

Examples:
- Bug fix: `1.2.0` → `1.2.1`
- New feature: `1.2.1` → `1.3.0`
- Major rewrite: `1.3.0` → `2.0.0`

## Troubleshooting

### Update Not Showing on Windows:
- Check if update-manifest.json is uploaded correctly
- Verify URL in manifest is accessible
- Check Windows app version in package.json
- Restart the app to force immediate check

### Update Not Showing on Android:
- Check app-updater.js is included in build
- Verify Android version code is incremented
- Check Firebase Storage URLs are public
- Restart the app

### Firebase Storage Upload Issues:
- Ensure you're logged in to Firebase Console
- Check file permissions (should be public)
- Verify bucket name matches your project

## Security Notes

- Update manifest must be on HTTPS (Firebase Storage is secure)
- Android APK should be signed with same key
- Windows app doesn't auto-install for security (user downloads manually)
- All update checks happen over secure connections

## Quick Reference Commands

```powershell
# Deploy new version
.\deploy-updates.ps1 -Version "1.2.1" -ReleaseNotes "Bug fixes"

# Build Android only
cd android
.\gradlew assembleRelease

# Deploy web only
firebase deploy --only hosting

# Check current version
Get-Content package.json | ConvertFrom-Json | Select-Object version
```

## Firebase Storage Setup (One-time)

1. Go to Firebase Console → Storage
2. Click "Get Started" if not enabled
3. Create folder structure:
   ```
   updates/
   ├── update-manifest.json
   ├── android/
   │   └── danfosal-app-{version}.apk
   └── windows/
       └── Danfosal-App-Setup-{version}.exe
   ```
4. Set rules to allow public read:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /updates/{allPaths=**} {
         allow read: if true;
       }
     }
   }
   ```

## Benefits of This System

✅ **Centralized Updates**: Push once from laptop, updates everywhere
✅ **No App Store**: Direct distribution, faster updates
✅ **Automatic Checks**: Users always notified of new versions
✅ **Flexible**: Can make updates mandatory if needed
✅ **Portable**: Windows app works from any location
✅ **Offline Work**: App works offline, updates when online

## Next Steps

1. Test the deployment script
2. Upload first version to Firebase Storage
3. Test update on work PC
4. Document your workflow for future updates
