const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, limited desktop application bridge
// Keeps Node.js isolated while giving high-performance FFmpeg video streaming to disk
contextBridge.exposeInMainWorld('desktopApp', {
  isElectron: true,
  platform: process.platform,
  hasFfmpeg: true,

  startFfmpegRecording: (options) => ipcRenderer.invoke('recorder:start', options),
  sendVideoChunk: (sessionIdOrBuffer, optionalBuffer) => {
    if (optionalBuffer !== undefined) {
      ipcRenderer.send('recorder:chunk', sessionIdOrBuffer, optionalBuffer);
    } else {
      ipcRenderer.send('recorder:chunk', sessionIdOrBuffer);
    }
  },
  stopFfmpegRecording: () => ipcRenderer.invoke('recorder:stop'),
  openVideoFolder: (filePath) => ipcRenderer.invoke('recorder:open-folder', filePath),
});

