/**
 * setup-assets.js
 *
 * Run once before starting the experiment: npm run setup
 *
 * Generates:
 *   - Test images: hero + 6 gallery images (JPEG, WebP, AVIF) — 21 files total
 *   - JavaScript payload files: 100KB, 500KB, 1000KB (F1)
 *   - Code-split JS bundles: app-bundle.js + chunk-a/b/c.js (F5)
 *   - Render-blocking CSS files: blocking-1/2/3.css (F2)
 *
 * After running setup, the database must also be seeded if not already done:
 *   mysql -u root -p < db-setup.sql
 *
 * The script will remind you of this at the end.
 */

const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const PUBLIC = path.join(__dirname, '../public');
const IMAGES = path.join(PUBLIC, 'images');
const JS     = path.join(PUBLIC, 'js');
const CSS    = path.join(PUBLIC, 'css');

// ── Ensure directories exist ─────────────────────────────────────────────────
[IMAGES, JS, CSS].forEach(dir => fs.mkdirSync(dir, { recursive: true }));
fs.mkdirSync(path.join(__dirname, '../results'), { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// 1. IMAGES
// ─────────────────────────────────────────────────────────────────────────────

function makeSVGBuffer(width, height, hue) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="hsl(${hue},70%,45%)"/>
          <stop offset="50%"  stop-color="hsl(${(hue+60)%360},65%,55%)"/>
          <stop offset="100%" stop-color="hsl(${(hue+120)%360},70%,40%)"/>
        </linearGradient>
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
          <feBlend in="SourceGraphic" mode="overlay"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect width="100%" height="100%" fill="url(#g)" filter="url(#noise)" opacity="0.25"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
            fill="white" font-size="${Math.floor(height*0.1)}" font-family="sans-serif"
            opacity="0.6">Performance Test</text>
    </svg>`;
  return Buffer.from(svg);
}

const imageDefs = [
  { name: 'hero',      width: 1200, height: 420, hue: 220 },
  { name: 'gallery-1', width: 380,  height: 180, hue: 0   },
  { name: 'gallery-2', width: 380,  height: 180, hue: 45  },
  { name: 'gallery-3', width: 380,  height: 180, hue: 90  },
  { name: 'gallery-4', width: 380,  height: 180, hue: 135 },
  { name: 'gallery-5', width: 380,  height: 180, hue: 180 },
  { name: 'gallery-6', width: 380,  height: 180, hue: 270 },
];

const formats = [
  { ext: 'jpeg', options: { quality: 85 } },
  { ext: 'webp', options: { quality: 85 } },
  { ext: 'avif', options: { quality: 60 } },
];

async function generateImages() {
  console.log('\n[1/3] Generating images...');
  for (const img of imageDefs) {
    const svgBuf = makeSVGBuffer(img.width, img.height, img.hue);
    const base   = sharp(svgBuf);
    for (const fmt of formats) {
      const outPath = path.join(IMAGES, `${img.name}.${fmt.ext}`);
      try {
        await base.clone().toFormat(fmt.ext, fmt.options).toFile(outPath);
        const stat = fs.statSync(outPath);
        console.log(`  ✓ ${img.name}.${fmt.ext} (${(stat.size/1024).toFixed(1)} KB)`);
      } catch (err) {
        if (fmt.ext === 'avif') {
          console.warn(`  ⚠ AVIF not supported on this platform — using WebP fallback for ${img.name}.avif`);
          const webpPath = path.join(IMAGES, `${img.name}.webp`);
          if (fs.existsSync(webpPath)) fs.copyFileSync(webpPath, outPath);
        } else {
          throw err;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. JAVASCRIPT PAYLOAD FILES (F1)
// ─────────────────────────────────────────────────────────────────────────────

function generateJSPayload(targetKB) {
  const targetBytes = targetKB * 1024;
  const lines = [
    `/* Auto-generated JS payload — target size: ${targetKB}KB */`,
    `/* Simulates a real-world JavaScript bundle for performance testing */`,
    `(function() {`,
    `  'use strict';`,
  ];
  let size = lines.join('\n').length, i = 0;
  while (size < targetBytes - 200) {
    const body = `'payload_string_${i}_${'x'.repeat(40)}';`;
    lines.push(`  function _fn${i}() { return ${body} }`);
    size += lines[lines.length - 1].length + 1;
    i++;
  }
  lines.push(`  /* Total functions: ${i} */`);
  lines.push(`}());`);
  return lines.join('\n');
}

async function generateJSFiles() {
  console.log('\n[2/3] Generating JavaScript payload files...');
  for (const kb of [100, 500, 1000]) {
    const content = generateJSPayload(kb);
    const outPath = path.join(JS, `payload-${kb}kb.js`);
    fs.writeFileSync(outPath, content, 'utf8');
    console.log(`  ✓ payload-${kb}kb.js (actual: ${(fs.statSync(outPath).size/1024).toFixed(1)} KB)`);
  }
  for (const label of ['a', 'b', 'c']) {
    const content = generateJSPayload(100);
    const outPath = path.join(JS, `chunk-${label}.js`);
    fs.writeFileSync(outPath, content, 'utf8');
    console.log(`  ✓ chunk-${label}.js (actual: ${(fs.statSync(outPath).size/1024).toFixed(1)} KB)`);
  }
  const bundleContent = ['a','b','c'].map(l => fs.readFileSync(path.join(JS, `chunk-${l}.js`), 'utf8')).join('\n\n');
  const bundlePath    = path.join(JS, 'app-bundle.js');
  fs.writeFileSync(bundlePath, bundleContent, 'utf8');
  console.log(`  ✓ app-bundle.js (actual: ${(fs.statSync(bundlePath).size/1024).toFixed(1)} KB)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RENDER-BLOCKING CSS FILES (F2)
// ─────────────────────────────────────────────────────────────────────────────

function generateBlockingCSS(index) {
  const lines = [
    `/* Render-blocking stylesheet ${index} — loaded synchronously in <head> */`,
    `:root { --block-color-${index}: #1a1a2e; }`,
  ];
  for (let i = 0; i < 500; i++) {
    lines.push(`.block-rule-${index}-${i} {`);
    lines.push(`  color: var(--block-color-${index});`);
    lines.push(`  background-color: #f${i.toString(16).padStart(3,'0')};`);
    lines.push(`  padding: ${i%20}px ${(i+4)%20}px;`);
    lines.push(`  margin: ${i%10}px;`);
    lines.push(`  font-size: ${12+(i%8)}px;`);
    lines.push(`  border: 1px solid rgba(${i%255},${(i*2)%255},${(i*3)%255},0.3);`);
    lines.push(`  transition: all 0.${i%9}s ease;`);
    lines.push(`}`);
  }
  return lines.join('\n');
}

function generateCSSFiles() {
  console.log('\n[3/3] Generating render-blocking CSS files...');
  for (let i = 1; i <= 3; i++) {
    const outPath = path.join(CSS, `blocking-${i}.css`);
    fs.writeFileSync(outPath, generateBlockingCSS(i), 'utf8');
    console.log(`  ✓ blocking-${i}.css (actual: ${(fs.statSync(outPath).size/1024).toFixed(1)} KB)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ALL
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Web Performance Experiment — Asset Setup ===');
  await generateImages();
  await generateJSFiles();
  generateCSSFiles();

  console.log('\n✅ All assets generated successfully.\n');
  console.log('─────────────────────────────────────────────────');
  console.log('Database setup (if not done yet):');
  console.log('  Locate your mysql.exe file and run:');
  console.log('  "<path-to-your-mysql.exe>" -u root -p < db-setup.sql');
  console.log('  Example: "C:\\Program Files\\MySQL\\MySQL Server X.X\\bin\\mysql.exe"');
  console.log('Next steps:');
  console.log('  Terminal 1: npm start');
  console.log('  Terminal 2: npm run benchmark\n');
}

main().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  process.exit(1);
});
