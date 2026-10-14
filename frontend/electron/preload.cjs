const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('allmodelai', {
  isElectron: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke('allmodelai:open-external', url),
});
