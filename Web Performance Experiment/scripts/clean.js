'use strict';

/**
 * clean.js
 *
 * Wipes the results/ folder only.
 * Use this to clear old benchmark data before a fresh run.
 * Does NOT touch the database or generated assets.
 *
 * Usage:
 *   npm run clean
 */

const fs   = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../results');

if (fs.existsSync(RESULTS_DIR)) {
  const files = fs.readdirSync(RESULTS_DIR);
  files.forEach(f => {
    fs.rmSync(path.join(RESULTS_DIR, f), { recursive: true, force: true });
  });
  console.log(`✓ results/ folder cleared (${files.length} file(s) removed)`);
} else {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  console.log('✓ results/ folder created (was missing)');
}

const combinedConfig = path.join(__dirname, '../benchmark/combined-config.js');
if (fs.existsSync(combinedConfig)) {
  fs.rmSync(combinedConfig);
  console.log('✓ combined-config.js removed');
}

console.log('\nReady for a fresh benchmark run.\n');
