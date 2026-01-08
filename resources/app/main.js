const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const https = require('https');
const fs = require('fs');

// Fix ICU data path issue for packaged apps
if (process.env.NODE_ENV !== 'development') {
  process.env.ELECTRON_IS_DEV = '0';
  // Set ICU data path for packaged app
  const icuPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron', 'dist', 'icudtl.dat');
  if (fs.existsSync(icuPath)) {
    process.env.ICU_DATA = path.dirname(icuPath);
  }
  
  // Add command line switches to fix ICU issues
  app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
  app.commandLine.appendSwitch('--force-color-profile', 'srgb');
  app.commandLine.appendSwitch('--disable-software-rasterizer');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'build/icon.ico')
  });

  mainWindow.loadFile('www/index.html');
  
  // Open DevTools in development
  // mainWindow.webContents.openDevTools();
}

// Manual Update Check from Web App
async function checkForWebUpdates() {
  const updateUrl = 'https://firebasestorage.googleapis.com/v0/b/danfosal-app.appspot.com/o/updates%2Fupdate-manifest.json?alt=media';
  
  return new Promise((resolve) => {
    https.get(updateUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const manifest = JSON.parse(data);
          const currentVersion = app.getVersion();
          
          // Check if windows update info exists
          if (!manifest.windows || !manifest.windows.version) {
            console.log('No windows update info found');
            resolve(null);
            return;
          }
          
          const latestVersion = manifest.windows.version;
          
          if (compareVersions(latestVersion, currentVersion) > 0) {
            resolve(manifest.windows);
          } else {
            resolve(null);
          }
        } catch (error) {
          console.error('Update check error:', error);
          resolve(null);
        }
      });
    }).on('error', (error) => {
      console.error('Update check error:', error);
      resolve(null);
    });
  });
}

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

// Manual update check from web app
ipcMain.handle('check-for-updates', async () => {
  const updateInfo = await checkForWebUpdates();
  return updateInfo;
});

// Fetch URL without CORS restrictions (for fiscal invoice pages)
// Uses a hidden BrowserWindow to handle SPA rendering (Angular/React apps)
ipcMain.handle('fetch-url', async (event, url) => {
  console.log('📡 Fetching URL via hidden window (SPA mode):', url);
  
  // Create a hidden window to render the SPA
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false, 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Disable web security to avoid CORS issues within the frame
    }
  });

  return new Promise((resolve, reject) => {
    // Set a timeout to avoid hanging
    const timeout = setTimeout(() => {
      if (!win.isDestroyed()) {
        console.log('⏱️ Fetch timeout');
        win.destroy();
        reject(new Error('Timeout waiting for page load'));
      }
    }, 30000); // 30 seconds

    // Handle load errors
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('❌ Load failed:', errorDescription);
      clearTimeout(timeout);
      if (!win.isDestroyed()) win.destroy();
      reject(new Error(errorDescription));
    });

    // When page finishes loading
    win.webContents.on('did-finish-load', async () => {
      try {
        // Wait for the SPA to render dynamic content
        // Poll for content length to ensure we have the full invoice
        let attempts = 0;
        const maxAttempts = 10; // 10 seconds max wait
        
        const checkContent = async () => {
          if (win.isDestroyed()) return;
          
          const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
          console.log(`Attempt ${attempts + 1}: Content length ${html.length} bytes`);
          
          // Check for specific keywords that indicate the invoice is fully loaded
          // "Lista e Artikujve" is the header for the items section
          // "Detaje të Blerësit" is the customer section
          const hasKeywords = (html.includes('Lista e Artikujve') || html.includes('Detaje të Blerësit'));
          
          // If content is substantial AND has keywords, or we hit max attempts
          if ((html.length > 4000 && hasKeywords) || attempts >= maxAttempts) {
            // Scroll to bottom to ensure lazy-loaded elements render
            await win.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
            await new Promise(r => setTimeout(r, 500)); // Wait for scroll
            
            // Grab HTML again after scroll
            const finalHtml = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
            console.log('✅ Scraped rendered content:', finalHtml.length, 'bytes');
            
            clearTimeout(timeout);
            win.destroy();
            resolve(finalHtml);
          } else {
            // Wait 1 second and try again
            attempts++;
            setTimeout(checkContent, 1000);
          }
        };
        
        // Start polling
        checkContent();
        
      } catch (err) {
        console.error('❌ Scraping error:', err);
        if (!win.isDestroyed()) win.destroy();
        reject(err);
      }
    });

    // Load the URL
    win.loadURL(url);
  });
});

ipcMain.handle('download-update', async (event, updateInfo) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `Version ${updateInfo.version} is available!`,
    detail: updateInfo.releaseNotes,
    buttons: ['Download & Install', 'Later']
  });
  
  if (result.response === 0) {
    // User clicked "Download & Install"
    require('electron').shell.openExternal(updateInfo.url);
  }
});

// Auto Updater Events (fallback for electron-updater if configured)
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available!`,
    detail: 'The update will be downloaded in the background.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Up to date. Current version:', info.version);
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`;
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded!',
    detail: 'The application will restart to apply the update.',
    buttons: ['Restart Now', 'Later']
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  // Check for updates after 3 seconds (web-based update check)
  setTimeout(async () => {
    const updateInfo = await checkForWebUpdates();
    if (updateInfo && mainWindow) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${updateInfo.version} is available!`,
        detail: updateInfo.releaseNotes,
        buttons: ['Download', 'Later']
      });
      
      if (result.response === 0) {
        require('electron').shell.openExternal(updateInfo.url);
      }
    }
  }, 3000);

  // Check for updates every hour
  setInterval(async () => {
    const updateInfo = await checkForWebUpdates();
    if (updateInfo && mainWindow) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${updateInfo.version} is available!`,
        detail: updateInfo.releaseNotes,
        buttons: ['Download', 'Later']
      });
      
      if (result.response === 0) {
        require('electron').shell.openExternal(updateInfo.url);
      }
    }
  }, 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
