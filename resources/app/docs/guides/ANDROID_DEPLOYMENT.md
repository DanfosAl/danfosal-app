# 📱 Android App - OTA Update Deployment Guide

## 🎯 Overview

Your Android app now supports **Over-The-Air (OTA) updates**! Users will automatically receive update notifications and can install new versions with one tap - no Google Play Store needed.

---

## 🏗️ How It Works

1. **User opens app** → App checks `https://danfosal-app.web.app/app-version.json`
2. **New version available?** → Shows beautiful update dialog
3. **User taps "Update Now"** → Downloads APK from Firebase Hosting
4. **Android prompts installation** → User confirms → App updates!

### Update Check Frequency
- On app startup (after 3 seconds)
- Every 60 minutes while app is running

---

## 🚀 Quick Start - Deploy Your First Update

### Step 1: Prepare Android Build

```powershell
cd E:\danfosal-app

# Sync web assets and update version
.\build-android.ps1 -Version "1.1.0" -VersionCode 2
```

This script:
- ✅ Syncs `www/` files to Android project
- ✅ Updates version in `build.gradle`
- ✅ Updates `app-version.json` manifest

### Step 2: Build APK

**Option A - Android Studio (Recommended for signed APK)**

1. Open Android Studio
2. **File → Open** → `E:\danfosal-app\android`
3. **Build → Generate Signed Bundle/APK**
4. Select **APK**
5. Create or select keystore:
   - **First time**: Create new keystore
   - Store in safe location (e.g., `E:\danfosal-app\keystore\danfosal-release.jks`)
   - Remember password!
6. Choose **release** build variant
7. Click **Finish**
8. APK created at: `android\app\build\outputs\apk\release\app-release.apk`

**Option B - Command Line (Unsigned APK)**

```powershell
cd android
.\gradlew assembleRelease

# APK Location:
# android\app\build\outputs\apk\release\app-release-unsigned.apk
```

### Step 3: Deploy to Firebase Hosting

```powershell
# Deploy APK for OTA updates
.\deploy-android-update.ps1 -Version "1.1.0"
```

This script:
- ✅ Copies APK to `www/downloads/danfosal-app-v1.1.0.apk`
- ✅ Creates `www/downloads/danfosal-app-latest.apk` (symlink)
- ✅ Updates `app-version.json`
- ✅ Deploys to Firebase Hosting

---

## 📲 Installing on Phones (First Time)

### Method 1: Direct APK Installation

1. **Build signed APK** (see Step 2 above)
2. **Transfer APK to phone**:
   - USB cable
   - Email attachment
   - Cloud storage (Google Drive, Dropbox)
   - Or deploy to Firebase first, then download from web
3. **On phone**:
   - Enable "Install from Unknown Sources" in Settings
   - Tap APK file
   - Confirm installation

### Method 2: Deploy to Firebase First

1. Build and deploy APK (Steps 1-3 above)
2. On phone, open browser
3. Go to: `https://danfosal-app.web.app/downloads/danfosal-app-latest.apk`
4. Download APK
5. Install

---

## 🔄 Publishing Updates (After Initial Install)

Once users have the app installed with auto-update support:

### Quick Update Process

1. **Make changes** to HTML/JS files in `www/` folder

2. **Build and deploy**:
   ```powershell
   # Update version number
   .\build-android.ps1 -Version "1.2.0" -VersionCode 3
   
   # Build APK in Android Studio (or gradlew)
   
   # Deploy
   .\deploy-android-update.ps1 -Version "1.2.0"
   ```

3. **Users get notified automatically!**
   - Within 1 hour (next update check)
   - Beautiful dialog shows what's new
   - One tap to download and install

---

## 📝 Version Numbering

### Version Name (User-Facing)
Format: `Major.Minor.Patch` (e.g., `1.1.0`)
- **Major**: Big changes, breaking changes
- **Minor**: New features
- **Patch**: Bug fixes

### Version Code (Internal)
Integer that increments with each release:
- v1.0.0 → versionCode 1
- v1.1.0 → versionCode 2
- v1.2.0 → versionCode 3
- etc.

**Important**: Android requires versionCode to increase with each update.

---

## 🎨 Customizing Update Dialog

Edit `www/app-updater.js` to customize:

```javascript
// Change update check frequency (default: 1 hour)
this.checkInterval = 30 * 60 * 1000; // 30 minutes

// Customize dialog appearance
dialog.innerHTML = `...`; // Modify HTML/CSS

// Add custom release notes
updateInfo.releaseNotes = [
    "New feature 1",
    "Bug fix 2",
    "Performance improvement"
];
```

---

## 🔐 Creating Keystore (First Time Only)

For signed APK releases, create a keystore:

```powershell
# Create keystore directory
New-Item -ItemType Directory -Path "keystore" -Force

# Generate keystore (use Android Studio's wizard OR keytool)
keytool -genkey -v -keystore keystore\danfosal-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias danfosal-key
```

**Important**:
- Store keystore file safely (backup to cloud!)
- Remember passwords (store in password manager)
- Never commit keystore to git
- Same keystore required for all future updates

---

## 📊 Current Setup

### Version Info
- **Current Version**: 1.1.0
- **Version Code**: 2
- **Package ID**: com.danfosal.app

### Firebase Hosting URLs
- **Latest APK**: https://danfosal-app.web.app/downloads/danfosal-app-latest.apk
- **Version JSON**: https://danfosal-app.web.app/app-version.json
- **Versioned APK**: https://danfosal-app.web.app/downloads/danfosal-app-v1.1.0.apk

### Update Features
- ✅ Automatic update checks every hour
- ✅ Beautiful update dialog with release notes
- ✅ One-tap download and install
- ✅ Version history maintained
- ✅ Rollback support (host multiple versions)

---

## 🛠️ Troubleshooting

### App not checking for updates?
1. Check `app-updater.js` is loaded in HTML
2. Verify Capacitor is initialized: `window.Capacitor?.getPlatform()`
3. Check browser console for errors
4. Verify `app-version.json` is accessible: https://danfosal-app.web.app/app-version.json

### Update dialog not showing?
1. Increment version number in `app-version.json`
2. Clear app cache and relaunch
3. Check update check timing (runs after 3 seconds, then every hour)

### APK download fails?
1. Verify APK uploaded to Firebase Hosting
2. Check Firebase Hosting headers in `firebase.json`
3. Ensure phone has internet connection
4. Check Firebase Hosting quota

### Installation blocked?
1. Enable "Install from Unknown Sources" in Android settings
2. For newer Android: Settings → Apps → Special Access → Install Unknown Apps → Chrome → Allow
3. Verify APK is signed (unsigned APKs may be blocked)

---

## 📂 File Structure

```
danfosal-app/
├── www/
│   ├── app-updater.js          # Auto-update logic
│   ├── app-version.json        # Version manifest
│   ├── downloads/              # APK files (created on deploy)
│   │   ├── danfosal-app-latest.apk
│   │   └── danfosal-app-v1.1.0.apk
│   └── *.html                  # Web assets
├── android/
│   └── app/
│       ├── build.gradle        # Version info
│       └── build/outputs/apk/  # Built APKs
├── build-android.ps1           # Build preparation script
├── deploy-android-update.ps1   # Deployment script
├── firebase.json               # Hosting config
└── capacitor.config.ts         # App config
```

---

## 🎯 Deployment Checklist

### Initial Release (v1.1.0)
- [ ] Run `build-android.ps1 -Version "1.1.0" -VersionCode 2`
- [ ] Build signed APK in Android Studio
- [ ] Test APK on one phone
- [ ] Deploy: `deploy-android-update.ps1 -Version "1.1.0"`
- [ ] Verify https://danfosal-app.web.app/app-version.json
- [ ] Install APK on all phones
- [ ] Verify auto-update check works

### Future Updates (v1.2.0+)
- [ ] Update `www/` files with changes
- [ ] Run `build-android.ps1 -Version "1.2.0" -VersionCode 3`
- [ ] Build APK (same keystore!)
- [ ] Deploy: `deploy-android-update.ps1 -Version "1.2.0"`
- [ ] Wait for users to get notification (or force close/reopen app)
- [ ] Users tap "Update Now" → Done!

---

## 💡 Pro Tips

1. **Test updates on one phone first** before deploying to all devices

2. **Keep version history**:
   - Don't delete old APKs from `www/downloads/`
   - Allows rollback if needed

3. **Gradual rollouts**:
   - Update `app-version.json` gradually
   - Or use different update URLs for testing

4. **Release notes**:
   - Keep them short and user-friendly
   - Highlight new features users will notice

5. **Backup keystore**:
   - Store in cloud (encrypted)
   - Without keystore, can't update existing installs!

---

## 🔒 Security Notes

- APKs are served over HTTPS (Firebase Hosting)
- Use signed APKs for production (Android Studio)
- Unsigned APKs work but may trigger security warnings
- Firebase Hosting provides DDoS protection
- Update checks use HTTPS only

---

## 📈 Monitoring Updates

### Firebase Hosting Stats
- Dashboard: https://console.firebase.google.com/project/danfosal-app/hosting
- View download counts
- Monitor bandwidth usage

### User Update Status
- Check app logs for update check events
- Add analytics to track update acceptance rate
- Monitor version distribution in Firebase Analytics

---

## 🎉 Success Criteria

After setup, you should have:
- ✅ APK hosted on Firebase Hosting
- ✅ `app-version.json` accessible online
- ✅ App installed on phones
- ✅ Automatic update checks working
- ✅ Beautiful update dialog showing
- ✅ One-tap update installation

---

## 📞 Quick Reference Commands

```powershell
# Prepare build
.\build-android.ps1 -Version "1.x.x" -VersionCode X

# Build APK (Android Studio recommended)
# OR command line:
cd android; .\gradlew assembleRelease

# Deploy update
.\deploy-android-update.ps1 -Version "1.x.x"

# Test deployment
firebase serve  # Local test
firebase deploy --only hosting  # Production

# Check version online
(Invoke-WebRequest https://danfosal-app.web.app/app-version.json).Content
```

---

*Made with ❤️ for seamless Android updates*
