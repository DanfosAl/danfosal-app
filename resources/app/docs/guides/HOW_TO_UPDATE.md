# ⚡ HOW TO UPDATE YOUR APP

## Simple Version (Start Here!)

### Update Both Desktop & Android:
```powershell
.\quick-deploy.ps1 1.1.1 "What you changed"
```

Then upload desktop installer to GitHub. **That's it!**

---

## What Happens:

### ✅ Android (100% Automatic)
1. Script builds APK
2. Script deploys to Firebase  
3. **Phones auto-update in ~60 minutes**
4. **You're done!**

### ✅ Desktop (95% Automatic)
1. Script builds installer
2. You upload to GitHub (2 minutes)
3. **Computers auto-update in ~60 minutes**
4. **You're done!**

---

## Example:

```powershell
# You changed the analytics page
.\quick-deploy.ps1 1.1.2 "Updated analytics charts"

# Script runs... (builds everything)

# Then you:
# 1. Go to GitHub releases
# 2. Upload the .exe file
# 3. Done!
```

---

## Files to Know:

### Use this ONE script:
- **`quick-deploy.ps1`** ← This does everything

### Docs if you need help:
- **`QUICK_START.md`** ← Read this first
- **`DEPLOY_GUIDE.md`** ← Detailed guide

---

## Where Things Are:

### After running quick-deploy.ps1:

**Android APK** (already on Firebase!)
- Location: `www/downloads/danfosal-app-v1.1.1.apk`
- Online: https://danfosal-app.web.app/downloads/danfosal-app-latest.apk

**Desktop Installer** (upload this to GitHub)
- Location: `dist/Danfosal App Setup 1.1.1.exe`
- Also upload: `dist/latest.yml`

---

## GitHub Upload (2 Minutes):

1. **Go to**: https://github.com/DanfosAl/danfosal-app/releases/new
2. **Tag**: `v1.1.1` (match your version)
3. **Upload**: 
   - `dist/Danfosal App Setup 1.1.1.exe`
   - `dist/latest.yml`
4. **Click**: "Publish release"
5. **Done!**

---

## Testing:

### Test Android update:
- Install current APK on phone
- Run: `.\quick-deploy.ps1 1.1.2 "Test"`  
- Wait 60 min OR restart app
- Update dialog appears!

### Test Desktop update:
- Install current version on computer
- Upload new version to GitHub
- Wait 60 min OR restart app
- Update notification appears!

---

## That's Really It!

**One command + 2-minute GitHub upload = Both apps updated everywhere** 🚀

---

## Need Help?

1. Read `QUICK_START.md`
2. Check `DEPLOY_GUIDE.md` for details
3. Or just ask!

**Current Version: 1.1.0**
