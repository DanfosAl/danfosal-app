# 🚀 Deployment Guide - Unified Updates

## Quick Deploy (Updates Both Desktop & Android)

### Single Command Deployment
```powershell
.\deploy-update.ps1 -Version "1.1.1" -ReleaseNotes "Added new features and fixed bugs"
```

This ONE command will:
1. ✅ Update package.json version (Desktop)
2. ✅ Update Android build.gradle version
3. ✅ Update app-version.json (Android OTA manifest)
4. ✅ Build Android APK
5. ✅ Deploy Android APK to Firebase Hosting
6. ✅ Build Desktop installer
7. ✅ Generate summary of what to do next

---

## What Happens After Deployment

### 📱 Android Auto-Update
- APK is automatically deployed to Firebase Hosting
- Installed apps check for updates every 60 minutes
- Users get a beautiful update dialog
- One-tap to download and install
- **No manual distribution needed!**

### 🖥️ Desktop Auto-Update
- Installer is built in `dist/` folder
- You upload it to GitHub Releases (one-time step)
- Desktop apps check for updates every 60 minutes
- Users get a notification dialog
- Auto-downloads and installs
- **Seamless updates!**

---

## Complete Workflow Example

### Step 1: Make changes to your app
Edit any files in `www/` folder (HTML, CSS, JS, etc.)

### Step 2: Deploy update
```powershell
.\deploy-update.ps1 -Version "1.2.0" -ReleaseNotes "New analytics dashboard, Bug fixes"
```

### Step 3: Upload Desktop to GitHub (first time only)
1. Go to: https://github.com/DanfosAl/danfosal-app/releases/new
2. Tag: `v1.2.0`
3. Title: `Version 1.2.0`
4. Upload:
   - `dist/Danfosal App Setup 1.2.0.exe`
   - `dist/latest.yml`
5. Click "Publish release"

### Step 4: Wait for auto-updates! ✨
- Android phones: Update within 60 minutes automatically
- Desktop computers: Update within 60 minutes automatically
- You're done! 🎉

---

## Version Numbering

Use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes (1.0.0 → 2.0.0)
- **MINOR**: New features (1.0.0 → 1.1.0)
- **PATCH**: Bug fixes (1.0.0 → 1.0.1)

Examples:
```powershell
.\deploy-update.ps1 -Version "1.0.1" -ReleaseNotes "Fixed login bug"
.\deploy-update.ps1 -Version "1.1.0" -ReleaseNotes "Added export feature"
.\deploy-update.ps1 -Version "2.0.0" -ReleaseNotes "Complete redesign"
```

---

## Current Setup

### Android Auto-Update System
- ✅ `app-updater.js` - Update checker script (enabled)
- ✅ `app-version.json` - Version manifest
- ✅ Firebase Hosting - APK distribution
- ✅ Check interval: 60 minutes
- ✅ Update dialog: Beautiful gradient UI

### Desktop Auto-Update System
- ✅ `main.js` - electron-updater integration
- ✅ GitHub Releases - Installer distribution
- ✅ Check interval: 60 minutes on startup
- ✅ Update dialog: Native notifications

---

## Testing Updates

### Test Android Update
1. Install current APK on phone
2. Run: `.\deploy-update.ps1 -Version "1.1.1" -ReleaseNotes "Test update"`
3. Wait 60 minutes OR restart app
4. Update dialog should appear
5. Tap "Update Now" to test

### Test Desktop Update
1. Install current desktop app
2. Create GitHub release with new version
3. Wait 60 minutes OR restart app
4. Update notification should appear
5. Click to download and install

---

## Troubleshooting

### Android updates not showing?
- Check Firebase: `firebase deploy --only hosting`
- Check `www/app-version.json` has correct version
- Check app has internet connection
- Check console logs in browser DevTools

### Desktop updates not showing?
- Check GitHub release is published (not draft)
- Check `latest.yml` is uploaded
- Check version in `package.json` matches release
- Check app has internet connection

### Build errors?
- Android: `cd android; .\gradlew clean`
- Desktop: `Remove-Item -Recurse -Force dist, node_modules\.cache`
- Then run deploy script again

---

## Manual Deployment (Alternative)

If you prefer manual control:

### Android Only
```powershell
cd android
.\gradlew assembleDebug
firebase deploy --only hosting
```

### Desktop Only
```powershell
npm run dist
# Upload to GitHub manually
```

---

## File Locations

### Source Files
- `www/` - Web app (HTML, CSS, JS)
- `android/` - Android wrapper
- `main.js` - Desktop app main process
- `package.json` - Desktop app config

### Built Files
- `android/app/build/outputs/apk/debug/app-debug.apk` - Android APK
- `dist/Danfosal App Setup [version].exe` - Desktop installer
- `dist/latest.yml` - Desktop update manifest

### Update Manifests
- `www/app-version.json` - Android OTA manifest (deployed to Firebase)
- `dist/latest.yml` - Desktop update manifest (uploaded to GitHub)

---

## Firebase Hosting URLs

- **App**: https://danfosal-app.web.app
- **Android APK**: https://danfosal-app.web.app/downloads/danfosal-app-latest.apk
- **Version Check**: https://danfosal-app.web.app/app-version.json

---

## GitHub Repository

Create repository at: https://github.com/new
- Name: `danfosal-app`
- Visibility: Public (for auto-updates to work)
- Releases: https://github.com/DanfosAl/danfosal-app/releases

---

## Support

If you encounter issues:
1. Check the error logs in terminal
2. Verify all files are present
3. Ensure Firebase and GitHub are configured
4. Test internet connection
5. Try manual deployment steps

---

**🎉 You're all set! One command updates everything!**
