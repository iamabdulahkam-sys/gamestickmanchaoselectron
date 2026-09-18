const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, limited desktop application bridge
// Keeps Node.js isolated while giving high-performance FFmpeg video streaming to disk
contextBridge.exposeInMainWorld('desktopApp', {
  isElectron: true,
  platform: process.platform,
  hasFfmpeg: true,

  startFfmpegRecording: (options) => ipcRenderer.invoke('recorder:start', options),
  sendVideoChunk: (arrayBuffer) => ipcRenderer.send('recorder:chunk', arrayBuffer),
  stopFfmpegRecording: () => ipcRenderer.invoke('recorder:stop'),
  openVideoFolder: (filePath) => ipcRenderer.invoke('recorder:open-folder', filePath),
});

