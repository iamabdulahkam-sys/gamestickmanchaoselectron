/**
 * Generate Windows Application Icon (.ico & .png)
 * Uses Electron's built-in Chromium rendering engine for pixel-perfect 256x256 vector rasterization.
 */

import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.resolve(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const svgPath = path.resolve(__dirname, '../game/favicon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

function createIcoFromPng(pngBuffer) {
  // 6 bytes header + 16 bytes directory entry + pngBuffer
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(1, 4); // Count: 1 image

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(0, 0); // Width: 0 means 256px
  dirEntry.writeUInt8(0, 1); // Height: 0 means 256px
  dirEntry.writeUInt8(0, 2); // Color palette
  dirEntry.writeUInt8(0, 3); // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // Size of image data
  dirEntry.writeUInt32LE(22, 12); // Offset (6 + 16 = 22)

  return Buffer.concat([header, dirEntry, pngBuffer]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    webPreferences: {
      offscreen: true,
    },
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body, html { margin: 0; padding: 0; width: 256px; height: 256px; background: transparent; overflow: hidden; }
        svg { width: 256px; height: 256px; }
      </style>
    </head>
    <body>
      ${svgContent}
      <script>
        window.isReady = true;
      </script>
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Allow layout & vector rasterization
  await new Promise((resolve) => setTimeout(resolve, 500));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const pngBuffer = image.toPNG();

  const pngPath = path.join(buildDir, 'icon.png');
  fs.writeFileSync(pngPath, pngBuffer);
  console.log(`[Icon] Wrote 256x256 PNG to: ${pngPath}`);

  const icoBuffer = createIcoFromPng(pngBuffer);
  const icoPath = path.join(buildDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`[Icon] Wrote 256x256 Windows ICO to: ${icoPath}`);

  app.quit();
});
