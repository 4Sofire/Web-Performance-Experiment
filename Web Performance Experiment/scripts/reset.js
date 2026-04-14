'use strict';

/**
 * reset.js
 *
 * Full project reset:
 *   1. Clears the results/ folder
 *   2. Removes combined-config.js
 *   3. Clears generated public assets (css/, js/, images/ — empty, ready for setup)
 *   4. Instructs user to re-run: npm run setup
 *
 * Does NOT drop or recreate the database — run db-setup.sql manually if needed.
 *
 * Usage:
 *   npm run reset
 *   npm run setup     ← required after reset
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function clearDir(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`  Created ${label}`);
    return;
  }
  const files = fs.readdirSync(dirPath);
  files.forEach(f => fs.rmSync(path.join(dirPath, f), { recursive: true, force: true }));
  console.log(`  Cleared ${label} (${files.length} item(s))`);
}

console.log('\nRunning full project reset...\n');

// Results
clearDir(path.join(ROOT, 'results'), 'results/');

// Combined config
const combined = path.join(ROOT, 'benchmark/combined-config.js');
if (fs.existsSync(combined)) { fs.rmSync(combined); console.log('  Removed benchmark/combined-config.js'); }

// Generated assets
clearDir(path.join(ROOT, 'public/css'),    'public/css/');
clearDir(path.join(ROOT, 'public/js'),     'public/js/');
clearDir(path.join(ROOT, 'public/images'), 'public/images/');

console.log('\n✓ Reset complete.\n');
console.log('Next steps:');
console.log('  npm run setup    ← regenerates assets and seeds database');
console.log('  npm start        ← terminal 1');
console.log('  npm run benchmark ← terminal 2\n');
