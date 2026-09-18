/**
 * Sync Game Script
 * Ensures all files from D:\android app\stickmanchaos are linked or copied to game/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.resolve('D:/android app/stickmanchaos');
const targetDir = path.resolve(__dirname, '../game');

console.log('[Sync] Checking game files...');
console.log(`[Sync] Source: ${sourceDir}`);
console.log(`[Sync] Target: ${targetDir}`);

if (!fs.existsSync(sourceDir)) {
  console.warn(`[Sync] Warning: Source directory not found at ${sourceDir}`);
  if (fs.existsSync(targetDir)) {
    console.log('[Sync] Target directory already exists. Using existing game files.');
    process.exit(0);
  } else {
    console.error('[Sync] Error: Neither source nor target directory exists.');
    process.exit(1);
  }
}

// Check if target is a symbolic link or junction
try {
  const stats = fs.lstatSync(targetDir);
  if (stats.isSymbolicLink()) {
    console.log('[Sync] Target is an active junction/symlink to source. Live sync is already enabled.');
    process.exit(0);
  }
} catch (e) {
  // Target does not exist yet
}

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip git and agents folders
    if (entry.name === '.git' || entry.name === '.agents') {
      continue;
    }

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(sourceDir, targetDir);
console.log('[Sync] Game files synchronized successfully.');
