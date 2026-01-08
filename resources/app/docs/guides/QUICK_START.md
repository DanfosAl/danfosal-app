# 🚀 Danfosal App - Quick Start

## One-Command Deployment (Updates Both Apps!)

```powershell
.\quick-deploy.ps1 1.1.1 "Your release notes here"
```

**What it does:**
- ✅ Updates Android version  
- ✅ Builds Android APK
- ✅ Deploys to Firebase → **Android auto-updates enabled!**
- ✅ Updates Desktop version
- ✅ Builds Desktop installer
- ✅ Ready for GitHub upload

---

## 🎯 Daily Workflow

### 1. Edit your app
Make changes in `www/` folder (HTML, CSS, JS, etc.)

### 2. Deploy with one command
```powershell
.\quick-deploy.ps1 1.1.2 "Fixed analytics bug, Added export feature"
```

### 3. Upload Desktop to GitHub
- Go to: https://github.com/DanfosAl/danfosal-app/releases/new
- Tag: `v1.1.2`
- Upload files from `dist/` folder:
  - `Danfosal App Setup 1.1.2.exe`
  - `latest.yml`
- Click "Publish release"

### 4. Done! ✨
- **Android phones**: Auto-update within 60 minutes
- **Desktop computers**: Auto-update within 60 minutes

---

## 📱 Auto-Update System

### Android (Fully Automatic!)
- APK hosted on Firebase: https://danfosal-app.web.app
- Apps check for updates every 60 minutes
- Beautiful update dialog shows automatically
- Users tap "Update" → downloads → installs
- **No manual distribution needed!**

### Desktop (Semi-Automatic)
- Installers hosted on GitHub Releases
- Apps check every 60 minutes  
- Notification appears automatically
- Users click → downloads → installs
- **You just upload to GitHub once per update**

---

## 🔧 Version Examples

```powershell
# Bug fix (1.1.0 → 1.1.1)
.\quick-deploy.ps1 1.1.1 "Fixed login bug"

# New feature (1.1.0 → 1.2.0)  
.\quick-deploy.ps1 1.2.0 "Added export to Excel"

# Major update (1.2.0 → 2.0.0)
.\quick-deploy.ps1 2.0.0 "Complete redesign"
```

---

## 📂 Important Files

### Your app code:
- `www/index.html` - Main dashboard
- `www/analytics.html` - Analytics page  
- `www/products.html` - Products page
- `www/orders_online.html` - Orders page

### Deployment:
- `quick-deploy.ps1` - ONE command to update everything
- `www/app-updater.js` - Android auto-update checker
- `main.js` - Desktop auto-update system

### Built files:
- `android/app/build/outputs/apk/debug/app-debug.apk` - Android APK
- `dist/Danfosal App Setup [version].exe` - Desktop installer
- `www/downloads/` - APKs deployed to Firebase

---

## 🌐 URLs

- **Firebase App**: https://danfosal-app.web.app
- **Latest Android APK**: https://danfosal-app.web.app/downloads/danfosal-app-latest.apk
- **Firebase Console**: https://console.firebase.google.com/project/danfosal-app
- **GitHub Releases**: https://github.com/DanfosAl/danfosal-app/releases

---

## ⚡ Current Version

**1.1.0** - Initial release with auto-updates

### Features:
- ✅ Real-time Firebase database
- ✅ Instagram order tracking
- ✅ Analytics dashboard with charts
- ✅ Albania map visualization  
- ✅ Product management
- ✅ Debtor/Creditor tracking
- ✅ Auto-updates (Desktop & Android)
- ✅ Beautiful Tailwind UI

---

## 🆘 Quick Fixes

### Build fails?
```powershell
cd android
.\gradlew clean
cd ..
Remove-Item -Recurse -Force dist
```

### Updates not showing?
- **Android**: Check internet, wait 60 min or restart app
- **Desktop**: Check GitHub release is published (not draft)

---

**That's it! One command updates everything** 🎉
