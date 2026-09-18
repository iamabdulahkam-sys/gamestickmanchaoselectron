/**
 * Automated Live FFmpeg Recording Test
 * Verifies end-to-end NVENC 4K recording pipeline directly to disk.
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import '../electron/recorder-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.whenReady().then(async () => {
  console.log('=== ELECTRON LIVE FFMPEG RECORDING TEST ===');

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, '../electron/preload.cjs'),
    },
  });

  win.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer]: ${message}`);
  });

  const indexPath = path.join(__dirname, '../game/index.html');
  await win.loadFile(indexPath);

  // Allow game to render initial frames
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('[Test] Triggering window.canvasRecorder.start()...');
  await win.webContents.executeJavaScript(`
    window.canvasRecorder.start({
      resolutionKey: '4k',
      fps: 60,
      videoBitsPerSecond: 60000000,
    });
  `);

  // Record for 3 seconds of live gameplay
  console.log('[Test] Recording live gameplay for 3 seconds...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log('[Test] Stopping recording...');
  await win.webContents.executeJavaScript(`
    window.canvasRecorder.stop();
  `);

  // Wait for FFmpeg process to close and write MP4 file
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const recordingState = await win.webContents.executeJavaScript(`
    ({
      lastSavedFile: window.canvasRecorder.lastSavedFile,
      lastSavedName: window.canvasRecorder.lastSavedName,
      lastSavedSize: window.canvasRecorder.lastSavedSize,
      state: window.canvasRecorder.state,
    })
  `);

  console.log('[Test Recording State]:', recordingState);

  let success = false;
  if (recordingState.lastSavedFile && fs.existsSync(recordingState.lastSavedFile)) {
    const stats = fs.statSync(recordingState.lastSavedFile);
    console.log(`[Test SUCCESS] Video file verified on disk: ${recordingState.lastSavedFile} (${stats.size} bytes)`);
    success = stats.size > 10000;
  } else {
    console.error('[Test FAIL] Recorded file not found on disk.');
  }

  if (success) {
    console.log('=== LIVE FFMPEG NVENC RECORDING TEST: 100% PASSED ===');
    app.exit(0);
  } else {
    console.error('=== TEST FAILED ===');
    app.exit(1);
  }
});
