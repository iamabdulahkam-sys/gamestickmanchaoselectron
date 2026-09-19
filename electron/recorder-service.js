import { app, ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

class RecorderService {
  constructor() {
    this.activeProcess = null;
    this.currentFilePath = null;
    this.isRecording = false;
    this.ffmpegPath = this.resolveFfmpegPath();
    this.supportsNvenc = null;
    this.currentSessionId = 0;
    this.lastStopTime = 0;
    this.recentStderrLines = [];

    this.registerIpcHandlers();
  }

  resolveFfmpegPath() {
    // 1. Check known paths on system
    const candidates = [
      'ffmpeg',
      'C:\\Program Files\\ImageMagick-7.1.0-Q16-HDRI\\ffmpeg.exe',
      'D:\\Projects\\FFMPEG\\arfah-ffmpeg\\ffmpeg.exe',
    ];

    for (const candidate of candidates) {
      if (candidate === 'ffmpeg') return candidate;
      if (fs.existsSync(candidate)) return candidate;
    }
    return 'ffmpeg';
  }

  async checkNvencSupport() {
    if (this.supportsNvenc !== null) return this.supportsNvenc;
    return new Promise((resolve) => {
      try {
        const proc = spawn(this.ffmpegPath, ['-encoders']);
        let output = '';
        proc.stdout.on('data', (d) => (output += d.toString()));
        proc.stderr.on('data', (d) => (output += d.toString()));
        proc.on('close', () => {
          this.supportsNvenc = output.includes('h264_nvenc');
          console.log(`[RecorderService] NVENC Hardware Acceleration detected: ${this.supportsNvenc}`);
          resolve(this.supportsNvenc);
        });
        proc.on('error', () => {
          this.supportsNvenc = false;
          resolve(false);
        });
      } catch (e) {
        this.supportsNvenc = false;
        resolve(false);
      }
    });
  }

  getOutputDirectory() {
    // Priority: D:\StickmanVideos -> System Videos -> AppData Videos
    const preferred = 'D:\\StickmanVideos';
    try {
      if (!fs.existsSync(preferred)) {
        fs.mkdirSync(preferred, { recursive: true });
      }
      return preferred;
    } catch (e) {
      console.warn(`[RecorderService] Could not use ${preferred}, falling back:`, e.message);
    }

    const fallback = path.join(app.getPath('videos'), 'StickmanFlagChaos');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }

  generateFileName() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    return `StickmanChaos_${timestamp}.mp4`;
  }

  registerIpcHandlers() {
    ipcMain.handle('recorder:start', async (event, options = {}) => {
      if (this.isRecording) {
        return { success: false, error: 'Already recording' };
      }

      // GPU Grace Period: Give NVIDIA driver 350ms to completely release NVENC VRAM context
      const timeSinceStop = Date.now() - (this.lastStopTime || 0);
      if (timeSinceStop < 350) {
        const waitMs = 350 - timeSinceStop;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const sessionId = ++this.currentSessionId;
      const hasNvenc = await this.checkNvencSupport();
      const outDir = this.getOutputDirectory();
      const fileName = this.generateFileName();
      this.currentFilePath = path.join(outDir, fileName);

      const fps = parseInt(options.fps, 10) || 60;
      const bitrateNum = parseInt(options.videoBitsPerSecond, 10) || 40_000_000;
      const bitrateM = Math.max(10, Math.round(bitrateNum / 1_000_000));
      const maxrateM = Math.round(bitrateM * 1.5);
      const bufsizeM = bitrateM * 2;
      const hasAudio = options.includeAudio !== false;

      // Build robust FFmpeg command with safe stream mapping
      const ffmpegArgs = [
        '-y',
        '-f', 'webm',
        '-i', 'pipe:0',
        '-map', '0:v:0', // Explicitly map primary video stream
        '-map', '0:a?',   // Conditionally map audio: if present encode to aac, if absent do not abort
      ];

      if (hasNvenc) {
        ffmpegArgs.push(
          '-c:v', 'h264_nvenc',
          '-preset', 'fast',
          '-rc:v', 'vbr',
          '-cq', '18',
          '-b:v', `${bitrateM}M`,
          '-maxrate', `${maxrateM}M`,
          '-bufsize', `${bufsizeM}M`,
          '-r', String(fps)
        );
      } else {
        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '18',
          '-b:v', `${bitrateM}M`,
          '-r', String(fps)
        );
      }

      ffmpegArgs.push('-pix_fmt', 'yuv420p');

      if (hasAudio) {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
      } else {
        ffmpegArgs.push('-an');
      }

      // Web/VLC instant seekable faststart
      ffmpegArgs.push('-movflags', '+faststart', this.currentFilePath);

      console.log(`[RecorderService] Spawning FFmpeg (session #${sessionId}): ${this.ffmpegPath} ${ffmpegArgs.join(' ')}`);

      try {
        this.activeProcess = spawn(this.ffmpegPath, ffmpegArgs, {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.isRecording = true;
        this.recentStderrLines = [];

        this.activeProcess.stderr.on('data', (data) => {
          const str = data.toString();
          const lines = str.split(/\r?\n/).filter(Boolean);
          for (const l of lines) {
            this.recentStderrLines.push(l);
            if (this.recentStderrLines.length > 30) {
              this.recentStderrLines.shift();
            }
          }
          if (str.includes('Error') || str.includes('failed') || str.includes('Invalid')) {
            console.warn('[FFmpeg Stderr]:', str.trim());
          }
        });

        this.activeProcess.on('error', (err) => {
          console.error('[RecorderService] FFmpeg process error:', err);
          this.isRecording = false;
          this.lastStopTime = Date.now();
        });

        this.activeProcess.on('close', (code) => {
          console.log(`[RecorderService] FFmpeg process finished with exit code ${code}`);
          if (code !== 0 && this.recentStderrLines.length > 0) {
            console.error('[RecorderService] FFmpeg failure diagnostic details:\n' + this.recentStderrLines.slice(-10).join('\n'));
          }
          this.isRecording = false;
          this.lastStopTime = Date.now();
        });

        return {
          success: true,
          sessionId,
          filePath: this.currentFilePath,
          fileName,
          encoder: hasNvenc ? 'NVIDIA NVENC (GPU)' : 'Software x264 (CPU)',
        };
      } catch (err) {
        console.error('[RecorderService] Failed to start FFmpeg:', err);
        this.isRecording = false;
        this.lastStopTime = Date.now();
        return { success: false, error: err.message };
      }
    });

    ipcMain.on('recorder:chunk', (event, arg1, arg2) => {
      let sessionId = null;
      let chunkBuffer = null;

      if (arg2 !== undefined) {
        sessionId = arg1;
        chunkBuffer = arg2;
      } else {
        chunkBuffer = arg1;
      }

      if (!this.isRecording || !this.activeProcess || !this.activeProcess.stdin) {
        return;
      }

      // Discard stale chunk from previous recording session
      if (sessionId !== null && sessionId !== this.currentSessionId) {
        console.warn(`[RecorderService] Discarding stale chunk from session #${sessionId} (active: #${this.currentSessionId})`);
        return;
      }

      try {
        const buffer = Buffer.from(chunkBuffer);
        this.activeProcess.stdin.write(buffer);
      } catch (err) {
        console.error('[RecorderService] Error piping chunk to FFmpeg stdin:', err);
      }
    });

    ipcMain.handle('recorder:stop', async () => {
      if (!this.isRecording || !this.activeProcess) {
        return { success: false, error: 'No active recording' };
      }

      const filePath = this.currentFilePath;

      return new Promise((resolve) => {
        const proc = this.activeProcess;
        this.isRecording = false;
        this.activeProcess = null;
        this.lastStopTime = Date.now();

        proc.on('close', () => {
          this.lastStopTime = Date.now();
          let fileSizeMb = '0';
          try {
            if (fs.existsSync(filePath)) {
              const stats = fs.statSync(filePath);
              fileSizeMb = (stats.size / (1024 * 1024)).toFixed(2);
            }
          } catch (e) {}

          console.log(`[RecorderService] Recording saved to: ${filePath} (${fileSizeMb} MB)`);
          resolve({
            success: true,
            filePath,
            fileName: path.basename(filePath),
            sizeMb: fileSizeMb,
          });
        });

        try {
          proc.stdin.end();
        } catch (e) {
          console.warn('[RecorderService] Error closing stdin:', e);
        }
      });
    });

    ipcMain.handle('recorder:open-folder', (event, targetPath) => {
      const fileOrFolder = targetPath || this.getOutputDirectory();
      if (fs.existsSync(fileOrFolder)) {
        shell.showItemInFolder(fileOrFolder);
        return { success: true };
      }
      shell.openPath(this.getOutputDirectory());
      return { success: true };
    });
  }
}

export const recorderService = new RecorderService();
