const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (updateInfo) => ipcRenderer.invoke('download-update', updateInfo),
  fetchURL: (url) => ipcRenderer.invoke('fetch-url', url)
});
