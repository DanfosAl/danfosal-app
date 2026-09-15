# 🚀 Danfosal App - Deployment Guide

## 📦 Building the Desktop Application

### Prerequisites
- Node.js 18+ installed
- Windows OS (for building Windows installers)
- GitHub repository set up

---

## 🔧 Local Build (One-Time)

### 1. Install Dependencies
```bash
cd e:\danfosal-app
npm install
```

### 2. Build the Installer
```bash
npm run dist
```

This creates an installer in the `dist/` folder:
- `Danfosal App Setup 1.1.0.exe` - Full installer with auto-update

### 3. Install on Your Computer
1. Navigate to `dist/` folder
2. Run `Danfosal App Setup 1.1.0.exe`
3. Follow installation wizard
4. Desktop shortcut will be created automatically

---

## 🌐 Auto-Update Setup (GitHub Releases)

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `danfosal-app`
3. Make it **Public** (required for free auto-updates)
4. Click "Create repository"

### Step 2: Push Your Code to GitHub

```bash
cd e:\danfosal-app
git init
git add .
git commit -m "Initial commit - v1.1.0 with Instagram integration"
git branch -M main
git remote add origin https://github.com/DanfosAl/danfosal-app.git
git push -u origin main
```

### Step 3: Create Release with Installer

```bash
# Create version tag
git tag v1.1.0
git push origin v1.1.0

# Build and publish to GitHub
npm run publish
```

**OR manually:**
1. Build locally: `npm run dist`
2. Go to GitHub: https://github.com/DanfosAl/danfosal-app/releases/new
3. Click "Create new release"
4. Tag: `v1.1.0`
5. Title: `Danfosal App v1.1.0`
6. Description:
   ```
   ## 🎉 New Features
   - ✅ Instagram chatbot integration
   - ✅ Real-time stats cards on homepage
   - ✅ Instagram badge on orders
   - ✅ Albania map in analytics
   - ✅ Auto-update support
   
   ## 📥 Installation
   Download and run `Danfosal.App.Setup.1.1.0.exe`
   ```
7. Upload files from `dist/`:
   - `Danfosal App Setup 1.1.0.exe`
   - `latest.yml` (important for auto-updates!)
8. Click "Publish release"

---

## 🔄 Publishing Updates (Future Versions)

When you make changes to the app:

### 1. Update Version Number
Edit `package.json`:
```json
{
  "version": "1.2.0"  // Increment version
}
```

### 2. Commit Changes
```bash
git add .
git commit -m "Version 1.2.0 - New features description"
git push
```

### 3. Create New Release
```bash
# Tag the new version
git tag v1.2.0
git push origin v1.2.0

# Build and publish
npm run publish
```

### 4. Users Get Auto-Updated!
- App checks for updates every hour
- Users see notification: "Update available!"
- They click "Restart Now" → app updates automatically
- No manual download needed!

---

## 🖥️ How Auto-Update Works

1. **App starts** → checks GitHub releases for `latest.yml`
2. **Compares versions** → current (1.1.0) vs latest on GitHub
3. **If newer version exists**:
   - Downloads installer in background
   - Shows notification to user
   - User clicks "Restart Now"
   - App closes → installer runs → new version launches
4. **User's data is preserved** (Firebase cloud-based)

---

## 📱 Installing on Multiple Computers

### Method 1: From GitHub Release (Recommended)
1. Go to: https://github.com/DanfosAl/danfosal-app/releases/latest
2. Download `Danfosal App Setup 1.1.0.exe`
3. Run installer on each computer
4. Desktop shortcut created automatically
5. All computers auto-update when you publish new versions

### Method 2: Share Local Installer
1. Build locally: `npm run dist`
2. Copy `dist/Danfosal App Setup 1.1.0.exe` to USB drive
3. Install on other computers
4. They will auto-update from GitHub releases

---

## 🔐 Private Repository (Optional)

If you want the repository private:

1. Make repo private on GitHub
2. Update `package.json`:
   ```json
   "publish": [{
     "provider": "github",
     "owner": "DanfosAl",
     "repo": "danfosal-app",
     "private": true  // Add this
   }]
   ```
3. Generate GitHub token:
   - Settings → Developer settings → Personal access tokens
   - Generate new token (classic)
   - Permissions: `repo` (full control)
   - Copy token
4. Set environment variable before publishing:
   ```bash
   $env:GH_TOKEN="your_github_token_here"
   npm run publish
   ```

---

## 📊 Current Version Info

- **Version**: 1.1.0
- **New Features**:
  - Instagram chatbot integration
  - Real-time stats cards (Today's Revenue, Instagram Orders, Pending Orders, Total Customers)
  - Instagram badge on chatbot orders
  - Albania map visualization in analytics
  - Auto-update support

---

## 🛠️ Troubleshooting

### Auto-update not working?
1. Check GitHub release has `latest.yml` file
2. Verify repository is public (or token is set for private)
3. Check console logs in app (uncomment DevTools in main.js)

### Build fails?
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run dist
```

### Installer not creating desktop shortcut?
- Ensure `createDesktopShortcut: true` in package.json build config
- Run installer as Administrator

---

## 📝 Build Commands Reference

| Command | Description |
|---------|-------------|
| `npm start` | Run app in development mode |
| `npm run dist` | Build installer locally |
| `npm run dist:portable` | Build portable version (no installer) |
| `npm run publish` | Build and publish to GitHub releases |

---

## 🎯 Next Steps

1. ✅ Build installer locally
2. ✅ Test installation on your computer
3. ✅ Create GitHub repository
4. ✅ Push code to GitHub
5. ✅ Create first release (v1.1.0)
6. ✅ Install on other computers
7. ✅ Make updates → they auto-update! 🎉

---

*Made with ❤️ for seamless deployment and updates*
