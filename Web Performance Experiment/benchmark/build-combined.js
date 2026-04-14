'use strict';

/**
 * build-combined.js
 *
 * Reads the most recent descriptive-stats-*.csv, identifies:
 *   - The 2 front-end configurations with the smallest positive LCP change
 *     from baseline (least damaging front-end factors)
 *   - The 2 back-end configurations with the largest negative LCP change
 *     from baseline (most improving back-end factors)
 *
 * Then writes benchmark/combined-config.js with exactly 3 configurations:
 *   1. Combined - Best front-end (FX+FY)
 *   2. Combined - Best back-end (BX+BY)
 *   3. Combined - Full best (FX+FY+BX+BY)
 *
 * This answers RQ5 with real experimental data rather than mathematical
 * estimation, making the methodology more rigorous.
 *
 * Usage:
 *   npm run build-combined
 *   (Run AFTER: npm run benchmark && npm run analyse)
 */

const fs   = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../results');
const OUTPUT_PATH = path.join(__dirname, 'combined-config.js');

function getMostRecentDescriptive() {
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('descriptive-stats-') && f.endsWith('.csv'))
    .sort();
  return files.length ? path.join(RESULTS_DIR, files[files.length - 1]) : null;
}

function parseCSV(filePath) {
  const lines   = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const row  = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || '').trim().replace(/^"|"$/g, ''); });
    return row;
  });
}

function extractParams(label) {
  // Extract factor level from labels like "F1 - JS 100KB", "B1 - Server delay: 200ms"
  const p = {};
  if (/F1.*100KB/i.test(label))           { p.f1 = 100; }
  else if (/F1.*500KB/i.test(label))      { p.f1 = 500; }
  else if (/F1.*1000KB/i.test(label))     { p.f1 = 1000; }
  else if (/F2.*1 block/i.test(label))    { p.f2 = 1; }
  else if (/F2.*3 block/i.test(label))    { p.f2 = 3; }
  else if (/F3.*webp/i.test(label))       { p.f3 = 'webp'; }
  else if (/F3.*avif/i.test(label))       { p.f3 = 'avif'; }
  else if (/F4.*lazy/i.test(label))       { p.f4 = 'enabled'; }
  else if (/F5.*split/i.test(label))      { p.f5 = 'split'; }
  else if (/B1.*200ms/i.test(label))      { p.b1 = 200; }
  else if (/B1.*500ms/i.test(label))      { p.b1 = 500; }
  else if (/B1.*1000ms/i.test(label))     { p.b1 = 1000; }
  else if (/B2.*simple/i.test(label))     { p.b2 = 'simple'; }
  else if (/B2.*complex/i.test(label))    { p.b2 = 'complex'; }
  else if (/B3.*enabl/i.test(label))      { p.b3 = 'enabled'; }
  else if (/B4.*gzip/i.test(label))       { p.b4 = 'gzip'; }
  else if (/B4.*brotli/i.test(label))     { p.b4 = 'brotli'; }
  return p;
}

const BASELINE = { f1: 0, f2: 0, f3: 'jpeg', f4: 'disabled', f5: 'single', b1: 0, b2: 'none', b3: 'disabled', b4: 'none' };

function main() {
  const statsFile = getMostRecentDescriptive();
  if (!statsFile) {
    console.error('No descriptive-stats-*.csv found. Run: npm run analyse first.');
    process.exit(1);
  }

  console.log(`Reading: ${path.basename(statsFile)}`);
  const rows = parseCSV(statsFile);

  // Find baseline LCP mean
  const baselineRow = rows.find(r => r.label?.toLowerCase().includes('baseline'));
  if (!baselineRow) { console.error('Baseline row not found.'); process.exit(1); }
  const baselineLCP = parseFloat(baselineRow.LCP_mean);
  console.log(`Baseline LCP mean: ${baselineLCP}ms`);

  // Separate FE and BE (non-baseline) rows
  const feRows = rows.filter(r => /^F[1-5]/i.test(r.factor) && !r.label?.toLowerCase().includes('baseline'));
  const beRows = rows.filter(r => /^B[1-4]/i.test(r.factor) && !r.label?.toLowerCase().includes('baseline'));

  // FE: smallest positive LCP diff (least damaging)
  const feSorted = feRows
    .map(r => ({ ...r, lcpDiff: parseFloat(r.LCP_mean) - baselineLCP }))
    .sort((a, b) => a.lcpDiff - b.lcpDiff);

  // BE: largest negative LCP diff (most improving) — or least damaging if none negative
  const beSorted = beRows
    .map(r => ({ ...r, lcpDiff: parseFloat(r.LCP_mean) - baselineLCP }))
    .sort((a, b) => a.lcpDiff - b.lcpDiff);

  const top2FE = feSorted.slice(0, 2);
  const top2BE = beSorted.slice(0, 2);

  console.log(`\nBest 2 front-end (least LCP damage):`);
  top2FE.forEach(r => console.log(`  ${r.label} — LCP diff: ${r.lcpDiff > 0 ? '+' : ''}${r.lcpDiff.toFixed(1)}ms`));
  console.log(`\nBest 2 back-end (most LCP improvement):`);
  top2BE.forEach(r => console.log(`  ${r.label} — LCP diff: ${r.lcpDiff > 0 ? '+' : ''}${r.lcpDiff.toFixed(1)}ms`));

  // Build combined params
  const feParams = top2FE.reduce((acc, r) => ({ ...acc, ...extractParams(r.label) }), {});
  const beParams = top2BE.reduce((acc, r) => ({ ...acc, ...extractParams(r.label) }), {});

  const feNames = top2FE.map(r => r.factor).join('+');
  const beNames = top2BE.map(r => r.factor).join('+');

  const experiments = [
    {
      factor: `COMBINED_FE`,
      label:  `Combined - Best front-end (${feNames})`,
      config: { ...BASELINE, ...feParams },
    },
    {
      factor: `COMBINED_BE`,
      label:  `Combined - Best back-end (${beNames})`,
      config: { ...BASELINE, ...beParams },
    },
    {
      factor: `COMBINED_FULL`,
      label:  `Combined - Full best (${feNames}+${beNames})`,
      config: { ...BASELINE, ...feParams, ...beParams },
    },
  ];

  const fileContent = `'use strict';

/**
 * combined-config.js
 *
 * AUTO-GENERATED by build-combined.js — do not edit manually.
 * Re-run: npm run build-combined to regenerate.
 *
 * Generated: ${new Date().toISOString()}
 * Baseline LCP mean: ${baselineLCP}ms
 *
 * Best front-end configs: ${top2FE.map(r => r.label).join(', ')}
 * Best back-end configs:  ${top2BE.map(r => r.label).join(', ')}
 */

const COMBINED_EXPERIMENTS = ${JSON.stringify(experiments, null, 2)};

module.exports = { COMBINED_EXPERIMENTS };
`;

  fs.writeFileSync(OUTPUT_PATH, fileContent);
  console.log(`\n✓ combined-config.js written to benchmark/combined-config.js`);
  console.log(`  3 configurations ready for: npm run benchmark-combined\n`);
  experiments.forEach(e => {
    console.log(`  [${e.factor}] ${e.label}`);
    console.log(`    Config: ${JSON.stringify(e.config)}`);
  });
  console.log('');
}

main();
