const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { runAutopilot } = require('./autopilot-runner');

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
    // build/ is not packaged, so the old build/icon.ico path never existed in the installed
    // app; the PNG ships inside www/ (regenerate with node build/make-icon.cjs).
    icon: path.join(__dirname, 'www/assets/danfosal-logo.png')
  });

  mainWindow.loadFile('www/index.html');
}

// Updates (Finding #78): the installed app updates itself from GitHub Releases (DanfosAl/danfosal-app,
// published by tools/release/release.mjs). electron-updater reads resources/app-update.yml, which
// electron-builder writes from build.publish; it checks shortly after start and every 4 hours,
// downloads only the changed blocks in the background (the .blockmap beside the installer), and
// installs when the app closes - or at once if the owner picks Restart now.
const UPDATE_EVERY = 4 * 60 * 60 * 1000;
let updateState = { status: 'idle' };
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('update-available', info => { updateState = { status: 'downloading', version: info.version }; });
autoUpdater.on('update-not-available', () => { updateState = { status: 'latest', current: app.getVersion() }; });
autoUpdater.on('error', err => {
  updateState = { status: 'error', error: String((err && err.message) || err).split(/\r?\n/)[0].slice(0, 200) };
  console.error('Update error:', err);
});
autoUpdater.on('update-downloaded', async info => {
  updateState = { status: 'ready', version: info.version };
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const r = await dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Update ready', message: `Danfosal App ${info.version} is ready`,
    detail: 'Restart now to use it, or it installs itself when you close the app.',
    buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1
  });
  if (r.response === 0) autoUpdater.quitAndInstall(true, true);
});

function checkForUpdates() {
  if (!app.isPackaged) return Promise.resolve(null);       // running from the source folder
  if (['downloading', 'ready'].includes(updateState.status)) return Promise.resolve(null);
  return autoUpdater.checkForUpdates().catch(err => { console.error('Update check failed:', err && err.message); return null; });
}

// Settings > Check for updates.
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { status: 'dev', current: app.getVersion() };
  await checkForUpdates();
  return { current: app.getVersion(), ...updateState };
});

// Save the current page as a PDF (Insights > Export PDF, Stock > Prices > EasyPOS price list). The
// page lays itself out for print with @media print, so what is saved is exactly what the owner
// sees, minus the navigation. options: { landscape (default true), folder (a subfolder name) }.
// PDFs go to E:\Danfos Papers\Reports when that exists: Windows' Documents is redirected into
// OneDrive on the shop PC, and the owner keeps papers off OneDrive.
const PAPERS_REPORTS = 'E:\\Danfos Papers\\Reports';
ipcMain.handle('save-page-pdf', async (event, suggestedName, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  let folder = fs.existsSync(PAPERS_REPORTS) ? PAPERS_REPORTS : app.getPath('documents');
  if (options && options.folder && folder === PAPERS_REPORTS) {
    folder = path.join(PAPERS_REPORTS, String(options.folder).replace(/[\\/:*?"<>|.]/g, '-'));
    fs.mkdirSync(folder, { recursive: true });
  }
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save as PDF',
    defaultPath: path.join(folder, String(suggestedName || 'Danfosal report').replace(/[\\/:*?"<>|]/g, '-') + '.pdf'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (canceled || !filePath) return { saved: false };
  const pdf = await event.sender.printToPDF({ printBackground: true, landscape: !(options && options.landscape === false), pageSize: 'A4', margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
  fs.writeFileSync(filePath, pdf);
  shell.openPath(filePath);
  return { saved: true, filePath };
});

// "Check Downloads now" (Stock > Purchases, Receive delivery): the Paper Autopilot's sweep at once
// instead of waiting for Monday. See autopilot-runner.js.
ipcMain.handle('paper-autopilot-run', () => runAutopilot());

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

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  // Updates: a first check once the window is up, then every 4 hours.
  setTimeout(checkForUpdates, 10 * 1000);
  setInterval(checkForUpdates, UPDATE_EVERY);

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
