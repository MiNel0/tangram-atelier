const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tangramDesktop', Object.freeze({
  syncUsb: () => ipcRenderer.invoke('sync-usb'),
}));
