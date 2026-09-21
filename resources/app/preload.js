const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (updateInfo) => ipcRenderer.invoke('download-update', updateInfo),
  fetchURL: (url) => ipcRenderer.invoke('fetch-url', url),
  savePagePDF: (name) => ipcRenderer.invoke('save-page-pdf', name)
});

// Receipt Watcher IPC Bridge
contextBridge.exposeInMainWorld('api', {
  onNewSale: (callback) => {
    ipcRenderer.on('new-sale', (event, data) => callback(data));
  },
  onNewSaleOffline: (callback) => {
    ipcRenderer.on('new-sale-offline', (event, data) => callback(data));
  },
  onOrderFulfilled: (callback) => {
    ipcRenderer.on('order-fulfilled', (event, data) => callback(data));
  },
  onSyncCompleted: (callback) => {
    ipcRenderer.on('sync-completed', (event, data) => callback(data));
  },
  onParseFailed: (callback) => {
    ipcRenderer.on('parse-failed', (event, data) => callback(data));
  },
  onSaleDetectedGraphics: (callback) => {
    ipcRenderer.on('sale-detected-graphics', (event, data) => callback(data));
  }
});
