const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Fix ICU data path issue for packaged apps (same workaround as the main Danfosal App)
if (process.env.NODE_ENV !== 'development') {
  process.env.ELECTRON_IS_DEV = '0';
  const icuPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron', 'dist', 'icudtl.dat');
  if (fs.existsSync(icuPath)) {
    process.env.ICU_DATA = path.dirname(icuPath);
  }
  app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
  app.commandLine.appendSwitch('--force-color-profile', 'srgb');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 620,
    backgroundColor: '#090b10',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'www/assets/garanci-logo.png')
  });

  mainWindow.loadFile('www/index.html');

  // Any link opened with target="_blank" (e.g. the warranty print page) goes to
  // the system browser instead of a second Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.danfosal.warranty');
  createWindow();

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
