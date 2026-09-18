/**
 * Automated Electron Verification Test Runner
 * Boots Electron with the game, monitors console, checks APIs and Canvas.
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import '../electron/recorder-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const errors = [];
const logs = [];

app.whenReady().then(async () => {
  console.log('=== ELECTRON AUTOMATED TEST SUITE ===');

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    show: false, // offscreen/headless test
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '../electron/preload.cjs'),
      devTools: true,
    },
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    logs.push({ level, message, line, sourceId });
    if (level >= 3) {
      // Level 3 is error
      console.error(`[Renderer Error] [line ${line}]: ${message}`);
      errors.push(message);
    } else {
      console.log(`[Renderer Log]: ${message}`);
    }
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    errors.push(`Failed to load page: ${errorCode} - ${errorDescription}`);
  });

  const indexPath = path.join(__dirname, '../game/index.html');
  console.log(`[Test] Loading game entry: ${indexPath}`);
  await win.loadFile(indexPath);

  // Wait 3 seconds for game bootstrap, Matter.js physics init, and first frames
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Run in-page assertions
  const testResults = await win.webContents.executeJavaScript(`
    (() => {
      const results = {};
      
      // Test A: Canvas existence & dimension
      const canvas = document.getElementById('game-canvas');
      results.canvasExists = !!canvas;
      results.canvasWidth = canvas ? canvas.width : 0;
      results.canvasHeight = canvas ? canvas.height : 0;

      // Test B: Matter.js engine
      results.matterLoaded = typeof window.Matter !== 'undefined';

      // Test C: Global game objects
      results.gameInitialized = typeof window.game !== 'undefined' && !!window.game;
      results.configLoaded = typeof window.CONFIG !== 'undefined';
      results.flagsLoaded = typeof window.FLAGS !== 'undefined';
      results.soundLoaded = typeof window.sound !== 'undefined';

      // Test D: Desktop Preload API
      results.isElectron = typeof window.desktopApp !== 'undefined' && window.desktopApp.isElectron === true;
      results.platform = window.desktopApp ? window.desktopApp.platform : null;

      // Test E: Game loop active
      results.isLoopActive = window.game ? window.game.isRunning : false;
      results.fightersCount = (window.game && window.game.fighters) ? window.game.fighters.length : 0;

      // Test F: LocalStorage available
      try {
        localStorage.setItem('test_key', 'test_val');
        results.localStorageWorks = localStorage.getItem('test_key') === 'test_val';
        localStorage.removeItem('test_key');
      } catch (e) {
        results.localStorageWorks = false;
      }

      // Test G: FFmpeg Desktop Recorder Bridge
      results.hasFfmpegBridge = typeof window.desktopApp?.startFfmpegRecording === 'function' &&
                                typeof window.desktopApp?.sendVideoChunk === 'function' &&
                                typeof window.desktopApp?.stopFfmpegRecording === 'function';
      results.recorderAttached = typeof window.canvasRecorder !== 'undefined';

      // Test H: Audio stream multi-session readiness (Check track readyState is live)
      if (window.sound) {
        const stream = window.sound.getAudioStream();
        const track = stream ? stream.getAudioTracks()[0] : null;
        results.audioStreamLive = !!track && track.readyState === 'live';
      } else {
        results.audioStreamLive = false;
      }

      // Test I: Tournament Canvas Intro Showcase
      if (window.game?.tournament) {
        window.game.tournament.startTournament(1);
        results.tournamentActive = window.game.tournament.isActive;
        results.tournamentIntroActive = window.game.tournament.isShowingIntro;
        results.tournamentPoolCount = window.game.tournament.currentPool ? window.game.tournament.currentPool.length : 0;
        // Exit back to normal
        window.game.tournament.exitTournament();
      }

      return results;
    })()
  `);

  console.log('[Test Results]:', JSON.stringify(testResults, null, 2));

  let passed = true;
  if (!testResults.canvasExists) {
    console.error('FAIL: Canvas element not found.');
    passed = false;
  }
  if (!testResults.matterLoaded) {
    console.error('FAIL: Matter.js physics engine not loaded.');
    passed = false;
  }
  if (!testResults.gameInitialized) {
    console.error('FAIL: GameManager not initialized.');
    passed = false;
  }
  if (!testResults.hasFfmpegBridge) {
    console.error('FAIL: Desktop FFmpeg bridge functions not found in preload.');
    passed = false;
  }
  if (!testResults.recorderAttached) {
    console.error('FAIL: CanvasRecorder instance not attached to window.');
    passed = false;
  }
  if (!testResults.isElectron) {
    console.error('FAIL: desktopApp preload bridge not detected in renderer.');
    passed = false;
  }
  if (!testResults.localStorageWorks) {
    console.error('FAIL: localStorage is not operational.');
    passed = false;
  }
  if (!testResults.audioStreamLive) {
    console.error('FAIL: AudioStream track is not live/ready.');
    passed = false;
  }
  if (!testResults.tournamentActive) {
    console.error('FAIL: Tournament Mode could not be activated.');
    passed = false;
  }
  if (testResults.tournamentPoolCount !== 64) {
    console.error(`FAIL: Expected 64 tournament pool countries, got ${testResults.tournamentPoolCount}`);
    passed = false;
  }
  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} renderer errors encountered:`, errors);
    passed = false;
  }

  if (passed) {
    console.log('=== ALL AUTOMATED TESTS PASSED (100% SUCCESS) ===');
    app.exit(0);
  } else {
    console.error('=== SOME TESTS FAILED ===');
    app.exit(1);
  }
});
