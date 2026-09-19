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
      paintWhenInitiallyHidden: true,
      preload: path.join(__dirname, '../electron/preload.cjs'),
    },
  });

  win.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer]: ${message}`);
  });

  const indexPath = path.join(__dirname, '../game/index.html');
  await win.loadFile(indexPath);

  // Allow game to render initial frames
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Function to run a recording session
  async function runSession(sessionNum) {
    console.log(`[Test] --- STARTING RECORDING SESSION #${sessionNum} ---`);
    await win.webContents.executeJavaScript(`
      window.canvasRecorder.start({
        resolutionKey: '4k',
        fps: 60,
        videoBitsPerSecond: 60000000,
      });
    `);

    // Record for 2.5 seconds
    await new Promise((resolve) => setTimeout(resolve, 2500));

    console.log(`[Test] Stopping session #${sessionNum}...`);
    await win.webContents.executeJavaScript(`
      window.canvasRecorder.stop();
    `);

    // Wait for file finalize
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const state = await win.webContents.executeJavaScript(`
      ({
        lastSavedFile: window.canvasRecorder.lastSavedFile,
        lastSavedName: window.canvasRecorder.lastSavedName,
        lastSavedSize: window.canvasRecorder.lastSavedSize,
        state: window.canvasRecorder.state,
      })
    `);

    console.log(`[Test Session #${sessionNum} Result]:`, state);
    return state;
  }

  // Session 1
  const res1 = await runSession(1);
  // Brief delay simulating podium / countdown before next tournament
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // Session 2 (the exact session that previously failed with "Too many packets buffered")
  const res2 = await runSession(2);

  let success = true;
  for (const [idx, res] of [res1, res2].entries()) {
    const sNum = idx + 1;
    if (res.lastSavedFile && fs.existsSync(res.lastSavedFile)) {
      const stats = fs.statSync(res.lastSavedFile);
      console.log(`[Test Session #${sNum} SUCCESS] Verified file on disk: ${res.lastSavedFile} (${stats.size} bytes)`);
      if (stats.size < 5000) {
        console.error(`[Test Session #${sNum} FAIL] File is too small (${stats.size} bytes).`);
        success = false;
      }
    } else {
      console.error(`[Test Session #${sNum} FAIL] File not found on disk.`);
      success = false;
    }
  }

  if (success) {
    console.log('=== MULTI-SESSION FFMPEG NVENC RECORDING TEST: 100% PASSED ===');
    app.exit(0);
  } else {
    console.error('=== MULTI-SESSION TEST FAILED ===');
    app.exit(1);
  }
});
