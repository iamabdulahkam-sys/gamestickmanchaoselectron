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

      // Test J: Tournament Setup Recording Defaults (4K, 60MBPS, MP4)
      const recToggle = document.getElementById('tournament-record-toggle');
      const activeRes = document.querySelector('#t-record-res-group .t-record-opt-btn.active');
      const activeBitrate = document.querySelector('#t-record-bitrate-group .t-record-opt-btn.active');
      const activeFormat = document.querySelector('#t-record-format-group .t-record-opt-btn.active');

      results.recordToggleExists = !!recToggle;
      results.recordToggleDefaultChecked = recToggle ? recToggle.checked : false;
      results.defaultResolution = activeRes ? activeRes.dataset.res : null;
      results.defaultBitrate = activeBitrate ? activeBitrate.dataset.bitrate : null;
      results.defaultFormat = activeFormat ? activeFormat.dataset.format : null;

      // Test K: Auto-recording lifecycle integration
      if (window.game?.tournament) {
        window.game.tournament.startTournament(1, null, {
          enabled: true,
          resolutionKey: '4k',
          videoBitsPerSecond: 60000000,
          format: 'mp4',
          fps: 60
        });
        results.tournamentAutoRecordStarted = window.game.tournament.autoRecordActive === true;
        
        // Test L: Per-tournament auto-save & fresh session restart
        window.game.tournament.startTournament(2, null, {
          enabled: true,
          resolutionKey: '4k',
          videoBitsPerSecond: 60000000,
          format: 'mp4',
          fps: 60
        });
        const t1RecStarted = window.game.tournament.autoRecordActive === true;
        // Simulate end of tournament 1 saving
        window.game.tournament.stopTournamentRecording();
        const t1RecSaved = window.game.tournament.autoRecordActive === false;
        // Advance to tournament 2
        window.game.tournament.skipPodiumTimerAndStartNext();
        const t2RecStarted = window.game.tournament.autoRecordActive === true;
        
        window.game.tournament.exitTournament();
        results.tournamentAutoRecordCleanExit = window.game.tournament.autoRecordActive === false;
        results.perTournamentSaveAndRestart = t1RecStarted && t1RecSaved && t2RecStarted;
      }

      // Test M: In-Engine Canvas Announcer & Weather Badge Integration
      if (window.game?.renderer?.hud) {
        results.canvasHudExists = true;
        window.game.ui.showCountdown('3');
        results.countdownOnCanvas = window.game.renderer.hud.announcer?.type === 'countdown' && window.game.renderer.hud.announcer?.text === '3';
        window.game.ui.showCountdown('FIGHT!', true);
        results.fightOnCanvas = window.game.renderer.hud.announcer?.type === 'fight' && window.game.renderer.hud.announcer?.text === 'FIGHT!';
        window.game.ui.showTeamEliminatedAnnounce('indonesia');
        results.countryOutOnCanvas = window.game.renderer.hud.announcer?.type === 'team_out' && window.game.renderer.hud.announcer?.text.includes('INDONESIA OUT');
        window.game.ui.showNatureAlert('HEAVY RAINSTORM!');
        results.weatherAlertOnCanvas = window.game.renderer.hud.announcer?.type === 'nature' && window.game.renderer.hud.announcer?.text === 'HEAVY RAINSTORM!';
        results.rightPanelExists = typeof window.game.renderer.hud.drawRightPanel === 'function';

        // Test N2: Live Chaos & Battle Feed Verification
        results.battleLogExists = Array.isArray(window.game.renderer.hud.battleLog);
        window.game.addBattleEvent({
          type: 'item',
          icon: '🗡️',
          country: { id: 'morocco', name: 'Morocco' },
          text: 'Morocco got Katana!',
          detail: 'ITEM',
          color: '#00F0FF'
        });
        window.game.addBattleEvent({
          type: 'bomb',
          icon: '💣',
          country: { id: 'japan', name: 'Japan' },
          text: 'Japan hit by Bomb! (-28 HP)',
          detail: '-28 HP',
          color: '#F97316'
        });
        window.game.addBattleEvent({
          type: 'weather',
          icon: '⚡',
          text: 'Weather: Thunderstorm',
          detail: 'SHIFT',
          color: '#FBBF24'
        });
        window.game.addBattleEvent({
          type: 'out',
          icon: '❌',
          country: { id: 'peru', name: 'Peru' },
          text: 'Peru OUT (#16)',
          detail: 'OUT',
          color: '#EF4444'
        });
        results.liveChaosFeedCapturesEvents = window.game.renderer.hud.battleLog.length >= 4;

        try {
          const ctx = window.game.renderer.ctx;
          window.game.renderer.hud.drawRightPanel(ctx, 1280, 720, window.game);
          results.liveChaosFeedRendersCleanly = true;
        } catch (e) {
          results.liveChaosFeedRendersCleanly = false;
        }

        // Test N3: Country reveal tick sound effect
        results.playCountryTickExists = typeof window.sound?.playCountryTick === 'function';
        try {
          window.sound.playCountryTick(5, 64);
          results.playCountryTickWorks = true;
        } catch (e) {
          results.playCountryTickWorks = false;
        }
      }

      // Test N: All countries in standings & OUT detection
      const standings = window.game?.getStandings ? window.game.getStandings() : [];
      results.standingsShowsAllCountries = Array.isArray(standings) && standings.length > 0;

      // Test O: Exclusion of oversized rectangle ('rectangle_full')
      const hasNoRectangleFullConfig = !window.CONFIG?.ARENA_SHAPES?.rectangle_full;
      const hasNoRectangleFullOption = !document.querySelector('#arena-shape option[value="rectangle_full"]');
      let tournamentNeverPicksRectangleFull = true;
      if (window.game?.tournament) {
        for (let i = 0; i < 50; i++) {
          const cond = window.game.tournament.generateRandomConditions();
          if (cond && cond.arenaShape === 'rectangle_full') {
            tournamentNeverPicksRectangleFull = false;
            break;
          }
        }
      }
      results.noBigRectangleInGame = hasNoRectangleFullConfig && hasNoRectangleFullOption && tournamentNeverPicksRectangleFull;

      // Test P: Simultaneous elimination / 0 alive countries handled gracefully
      let zeroAliveHandled = false;
      if (window.game?.tournament) {
        window.game.tournament.isActive = true;
        window.game.tournament.currentStageIndex = 4;
        window.game.tournament.isStageBattleActive = true;
        window.game.tournament.stageCleared = false;
        window.game.state = 'BATTLE';
        const handled = window.game.tournament.checkBattleStatus([], new Set());
        zeroAliveHandled = handled && window.game.tournament.stageCleared && window.game.state === 'RESULT' && !!window.game.winner;
        window.game.tournament.exitTournament();
      }
      results.zeroAliveHandledGracefully = zeroAliveHandled;

      // Test Q: Champion Card with pure Country object (Tournament winner)
      let championCardCountryWorks = false;
      if (window.game?.renderer?.hud) {
        try {
          const ctx = window.game.renderer.ctx;
          const countryWinner = { id: 'morocco', name: 'Morocco', code: 'MA' };
          window.game.renderer.hud.drawChampionCard(ctx, 1280, 720, countryWinner, window.game);
          const hasButtons = window.game.renderer.hud.interactiveButtons.length >= 2;
          championCardCountryWorks = hasButtons;
        } catch (e) {
          championCardCountryWorks = false;
        }
      }
      results.championCardCountryObjectRenders = championCardCountryWorks;

      // Test R: Champion Card with long country name (auto-downscale & bounds safety)
      let championCardLongNameWorks = false;
      if (window.game?.renderer?.hud) {
        try {
          const ctx = window.game.renderer.ctx;
          const longCountryWinner = { id: 'united_arab_emirates', name: 'United Arab Emirates', code: 'AE' };
          window.game.renderer.hud.drawChampionCard(ctx, 1280, 720, longCountryWinner, window.game);
          championCardLongNameWorks = true;
        } catch (e) {
          championCardLongNameWorks = false;
        }
      }
      results.championCardLongNameBounded = championCardLongNameWorks;

      // Test S: Tournament Podium with auto-scaling long name
      let tournamentPodiumWorks = false;
      if (window.game?.renderer?.hud && window.game?.tournament) {
        try {
          const ctx = window.game.renderer.ctx;
          window.game.tournament.podiumResults = [
            { id: 'papua_new_guinea', name: 'Papua New Guinea', code: 'PG' },
            { id: 'indonesia', name: 'Indonesia', code: 'ID' }
          ];
          window.game.renderer.hud.drawTournamentPodium(ctx, 1280, 720, window.game.tournament);
          tournamentPodiumWorks = true;
        } catch (e) {
          tournamentPodiumWorks = false;
        }
      }
      results.tournamentPodiumRendersCleanly = tournamentPodiumWorks;

      // Test T: Tournament 2 reset - ensure previous champion card is cleared and stage mission appears
      let tournament2ResetWorks = false;
      let tournament2ShowsStageMission = false;
      let winnerClearedOnNewTournament = false;
      let battleStateClean = false;
      let drawRightPanelCalled = false;
      let drawChampionCardCalled = false;
      if (window.game?.tournament && window.game?.renderer?.hud) {
        try {
          // 1. Simulate Tournament 1 ending with champion
          const dummyChampion = { id: 'colombia', name: 'Colombia', code: 'CO' };
          window.game.tournament.isActive = true;
          window.game.tournament.podiumResults = [dummyChampion];
          window.game.winner = dummyChampion;
          window.game.winnerDeclared = true;
          window.game.state = 'RESULT';

          // 2. Start Tournament 2
          window.game.tournament.launchNewTournamentInstance();
          winnerClearedOnNewTournament = window.game.winner === null &&
                                         window.game.winnerDeclared === false &&
                                         window.game.tournament.podiumResults === null;

          // 3. Launch Tournament 2 Stage 1 battle
          window.game.tournament.launchStageBattle();
          battleStateClean = (window.game.state === 'COUNTDOWN' || window.game.state === 'BATTLE') &&
                             window.game.tournament.isStageBattleActive === true &&
                             window.game.winner === null &&
                             window.game.winnerDeclared === false;

          // Transition to active BATTLE for HUD render test
          window.game.state = 'BATTLE';

          // 4. Render HUD and spy whether drawRightPanel or drawChampionCard is called
          const origDrawRightPanel = window.game.renderer.hud.drawRightPanel;
          const origDrawChampionCard = window.game.renderer.hud.drawChampionCard;
          window.game.renderer.hud.drawRightPanel = function(...args) {
            drawRightPanelCalled = true;
            return origDrawRightPanel.apply(this, args);
          };
          window.game.renderer.hud.drawChampionCard = function(...args) {
            drawChampionCardCalled = true;
            return origDrawChampionCard.apply(this, args);
          };

          // Trigger HUD render
          const ctx = window.game.renderer.ctx;
          window.game.renderer.hud.render(ctx, 1280, 720, window.game);

          // Restore original methods
          window.game.renderer.hud.drawRightPanel = origDrawRightPanel;
          window.game.renderer.hud.drawChampionCard = origDrawChampionCard;

          tournament2ResetWorks = winnerClearedOnNewTournament && battleStateClean;
          tournament2ShowsStageMission = drawRightPanelCalled && !drawChampionCardCalled;

          // Clean up tournament state
          window.game.tournament.exitTournament();
        } catch (e) {
          tournament2ResetWorks = false;
          tournament2ShowsStageMission = false;
        }
      }
      results.tournament2WinnerCleared = tournament2ResetWorks;
      results.tournament2ShowsStageMission = tournament2ShowsStageMission;

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
  if (!testResults.recordToggleExists) {
    console.error('FAIL: Tournament recording toggle element not found.');
    passed = false;
  }
  if (!testResults.recordToggleDefaultChecked) {
    console.error('FAIL: Tournament recording toggle should be checked by default.');
    passed = false;
  }
  if (testResults.defaultResolution !== '4k') {
    console.error(`FAIL: Expected default resolution '4k', got ${testResults.defaultResolution}`);
    passed = false;
  }
  if (testResults.defaultBitrate !== '60000000') {
    console.error(`FAIL: Expected default bitrate '60000000', got ${testResults.defaultBitrate}`);
    passed = false;
  }
  if (testResults.defaultFormat !== 'mp4') {
    console.error(`FAIL: Expected default format 'mp4', got ${testResults.defaultFormat}`);
    passed = false;
  }
  if (!testResults.tournamentAutoRecordStarted) {
    console.error('FAIL: Tournament auto-recording did not start with tournament.');
    passed = false;
  }
  if (!testResults.tournamentAutoRecordCleanExit) {
    console.error('FAIL: Tournament auto-recording did not clean up on exit.');
    passed = false;
  }
  if (!testResults.perTournamentSaveAndRestart) {
    console.error('FAIL: Per-tournament auto-save and restart failed.');
    passed = false;
  }
  if (!testResults.countdownOnCanvas) {
    console.error('FAIL: Countdown (3, 2, 1) was not sent to Canvas HUD.');
    passed = false;
  }
  if (!testResults.fightOnCanvas) {
    console.error('FAIL: FIGHT! announcement was not sent to Canvas HUD.');
    passed = false;
  }
  if (!testResults.countryOutOnCanvas) {
    console.error('FAIL: Country Out announcement was not sent to Canvas HUD.');
    passed = false;
  }
  if (!testResults.weatherAlertOnCanvas) {
    console.error('FAIL: Weather Alert was not sent to Canvas HUD.');
    passed = false;
  }
  if (!testResults.standingsShowsAllCountries) {
    console.error('FAIL: Standings list does not contain participating countries.');
    passed = false;
  }
  if (!testResults.noBigRectangleInGame) {
    console.error('FAIL: Oversized rectangle (rectangle_full) was still found in config, dropdown, or tournament generation.');
    passed = false;
  }
  if (!testResults.rightPanelExists) {
    console.error('FAIL: Right-side battle HUD panel method (drawRightPanel) not found on CanvasHUD.');
    passed = false;
  }
  if (!testResults.battleLogExists || !testResults.liveChaosFeedCapturesEvents || !testResults.liveChaosFeedRendersCleanly) {
    console.error('FAIL: Live Chaos & Battle Feed on right panel not functioning correctly.');
    passed = false;
  }
  if (!testResults.playCountryTickExists || !testResults.playCountryTickWorks) {
    console.error('FAIL: sound.playCountryTick is missing or threw an error.');
    passed = false;
  }
  if (!testResults.zeroAliveHandledGracefully) {
    console.error('FAIL: Simultaneous knockout (0 alive fighters) was not handled cleanly by tournament stage check.');
    passed = false;
  }
  if (!testResults.tournament2WinnerCleared) {
    console.error('FAIL: Previous tournament champion was not cleared when Tournament 2 started.');
    passed = false;
  }
  if (!testResults.tournament2ShowsStageMission) {
    console.error('FAIL: Stage mission right panel did not render or previous champion card was shown during Tournament 2 battle.');
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
