'use strict';

/**
 * runner.js
 *
 * Automated Lighthouse benchmarking runner.
 *
 * Runs each of the 18 OFAT configurations 50 times and saves results to a
 * timestamped CSV in the results/ folder. Supports smart resume: if a previous
 * run was interrupted, it detects which configurations are already complete and
 * continues from where it left off.
 *
 * Usage:
 *   npm run benchmark
 *   (Server must be running in a separate terminal: npm start)
 *
 * Output:
 *   results/results-TIMESTAMP.csv
 *   results/timing-TIMESTAMP.txt
 */

const puppeteer   = require('puppeteer');
const fs          = require('fs');
const path        = require('path');
const { EXPERIMENTS, BASELINE, buildConfig, configToQueryString } = require('./ofat-config');

// ── Configuration ────────────────────────────────────────────────────────────
const RUNS_PER_CONFIG = 50;
const BASE_URL        = process.env.BASE_URL || 'http://localhost:3000';
const RESULTS_DIR     = path.join(__dirname, '../results');
const DELAY_BETWEEN_RUNS_MS = 800;

// ── Lighthouse options ───────────────────────────────────────────────────────
// No throttling — controlled local testing environment.
// Port is extracted dynamically from Puppeteer's wsEndpoint (not hardcoded).
const LIGHTHOUSE_FLAGS = {
  output:          'json',
  logLevel:        'error',
  onlyCategories:  ['performance'],
  disableStorageReset: false,
};

const LIGHTHOUSE_CONFIG = {
  extends: 'lighthouse:default',
  settings: {
    throttlingMethod:  'provided',
    throttling: {
      rttMs:                  0,
      throughputKbps:         0,
      cpuSlowdownMultiplier:  1,
      requestLatencyMs:       0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps:   0,
    },
    formFactor:      'desktop',
    screenEmulation: {
      mobile:             false,
      width:              1350,
      height:             940,
      deviceScaleFactor:  1,
      disabled:           false,
    },
  },
};

// ── Ensure results directory exists ─────────────────────────────────────────
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ── CSV helpers ──────────────────────────────────────────────────────────────
const CSV_HEADER = 'factor,label,run,ttfb_ms,fcp_ms,speed_index_ms,lcp_ms,tbt_ms,cls,audit_duration_ms,config_duration_s,url\n';

function escapeCSV(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function rowToCSV(row) {
  return [
    row.factor, row.label, row.run,
    row.ttfb_ms, row.fcp_ms, row.speed_index_ms, row.lcp_ms, row.tbt_ms, row.cls,
    row.audit_duration_ms, row.config_duration_s, row.url,
  ].map(escapeCSV).join(',') + '\n';
}

// ── Smart resume: scan most recent CSV only ─────────────────────────────────
function getCompletedCounts(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return {};
  const lines  = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
  const counts = {};
  for (let i = 1; i < lines.length; i++) {
    const cols  = lines[i].split(',');
    const label = cols[1]?.replace(/^"|"$/g, '').trim();
    if (label) counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

function getMostRecentCSV() {
  if (!fs.existsSync(RESULTS_DIR)) return null;
  const files = fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('results-') && !f.startsWith('results-combined-') && f.endsWith('.csv'))
    .sort();
  return files.length ? path.join(RESULTS_DIR, files[files.length - 1]) : null;
}

// ── Main benchmark function ──────────────────────────────────────────────────
async function runBenchmark() {
  const startTime  = Date.now();
  const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const csvPath    = path.join(RESULTS_DIR, `results-${timestamp}.csv`);
  const timingPath = path.join(RESULTS_DIR, `timing-${timestamp}.txt`);

  // Determine resume state
  const mostRecentCSV   = getMostRecentCSV();
  const completedCounts = getCompletedCounts(mostRecentCSV);
  const totalCompleted  = Object.values(completedCounts).reduce((a, b) => a + b, 0);
  const allComplete     = EXPERIMENTS.every(e => (completedCounts[e.label] || 0) >= RUNS_PER_CONFIG);

  let outputCsvPath;
  let appendMode = false;

  if (allComplete) {
    // Previous run was complete — start fresh
    console.log('\nPrevious benchmark complete. Starting fresh run.\n');
    outputCsvPath = csvPath;
    fs.writeFileSync(outputCsvPath, CSV_HEADER);
    Object.keys(completedCounts).forEach(k => delete completedCounts[k]);
  } else if (totalCompleted === 0) {
    // No previous data — fresh run
    console.log('\nNo previous data found. Starting fresh run.\n');
    outputCsvPath = csvPath;
    fs.writeFileSync(outputCsvPath, CSV_HEADER);
  } else {
    // Resume from most recent incomplete CSV
    console.log(`\nResuming from: ${path.basename(mostRecentCSV)}`);
    console.log(`Completed runs found: ${totalCompleted}\n`);
    outputCsvPath = mostRecentCSV;
    appendMode    = true;
  }

  // ── Launch browser ─────────────────────────────────────────────────────
  // Port is extracted from wsEndpoint — never hardcoded.
  const executablePath = puppeteer.executablePath();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const wsEndpoint = browser.wsEndpoint();
  const portMatch  = wsEndpoint.match(/:(\d+)\//);
  if (!portMatch) {
    await browser.close();
    throw new Error(`Could not extract port from wsEndpoint: ${wsEndpoint}`);
  }
  const port = parseInt(portMatch[1]);
  console.log(`Browser launched on port ${port}`);

  const timingLines = [];
  let totalRuns     = 0;
  let totalAudits   = EXPERIMENTS.length * RUNS_PER_CONFIG;

  try {
    for (let expIdx = 0; expIdx < EXPERIMENTS.length; expIdx++) {
      const experiment = EXPERIMENTS[expIdx];
      const { factor, label, params } = experiment;
      const config      = buildConfig(params);
      const qs          = configToQueryString(config);
      const url         = `${BASE_URL}/?${qs}`;
      const alreadyDone = completedCounts[label] || 0;
      const runsNeeded  = RUNS_PER_CONFIG - alreadyDone;

      if (runsNeeded <= 0) {
        console.log(`[SKIP ${expIdx + 1}/${EXPERIMENTS.length}] ${label} — already complete (${alreadyDone} runs)`);
        totalRuns += alreadyDone;
        continue;
      }

      console.log(`\n[${expIdx + 1}/${EXPERIMENTS.length}] ${label}`);
      if (alreadyDone > 0) {
        console.log(`        Resuming from run ${alreadyDone + 1} of ${RUNS_PER_CONFIG}`);
      }

      // Clear server cache before B3=enabled tests
      if (config.b3 === 'disabled') {
        try {
          const http = require('http');
          await new Promise((resolve) => {
            const req = http.request(`${BASE_URL}/cache`, { method: 'DELETE' }, resolve);
            req.on('error', resolve);
            req.end();
          });
        } catch (_) { /* non-fatal */ }
      }

      const configStart = Date.now();

      for (let run = alreadyDone + 1; run <= RUNS_PER_CONFIG; run++) {
        const auditStart = Date.now();

        try {
          const { default: lighthouse } = await import('lighthouse');
          const { lhr } = await lighthouse(url, {
            ...LIGHTHOUSE_FLAGS,
            port,
          }, LIGHTHOUSE_CONFIG);

          const auditMs = Date.now() - auditStart;

          const ttfb    = Math.round((lhr.audits['server-response-time']?.numericValue ?? 0) * 10) / 10;
          const fcp     = Math.round((lhr.audits['first-contentful-paint']?.numericValue ?? 0) * 10) / 10;
          const si      = Math.round((lhr.audits['speed-index']?.numericValue ?? 0) * 10) / 10;
          const lcp     = Math.round((lhr.audits['largest-contentful-paint']?.numericValue ?? 0) * 10) / 10;
          const tbt     = Math.round((lhr.audits['total-blocking-time']?.numericValue ?? 0) * 10) / 10;
          const cls     = Math.round((lhr.audits['cumulative-layout-shift']?.numericValue ?? 0) * 10000) / 10000;

          const configDurationS = ((Date.now() - configStart) / 1000).toFixed(1);

          const row = {
            factor, label, run,
            ttfb_ms: ttfb, fcp_ms: fcp, speed_index_ms: si,
            lcp_ms: lcp, tbt_ms: tbt, cls,
            audit_duration_ms: auditMs,
            config_duration_s: configDurationS,
            url,
          };

          fs.appendFileSync(outputCsvPath, rowToCSV(row));
          totalRuns++;

          process.stdout.write(`  Run ${run}/${RUNS_PER_CONFIG} — TTFB: ${ttfb}ms | FCP: ${fcp}ms | SI: ${si}ms | LCP: ${lcp}ms | TBT: ${tbt}ms | CLS: ${cls} (${auditMs}ms)\n`);

        } catch (err) {
          console.error(`  Run ${run} FAILED: ${err.message}`);
        }

        if (run < RUNS_PER_CONFIG) {
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_RUNS_MS));
        }
      }

      const configDurationS = ((Date.now() - configStart) / 1000).toFixed(1);

      // Per-config metric summary
      const validRows = [];
      const allRows = fs.readFileSync(outputCsvPath, 'utf8').trim().split('\n').slice(1);
      allRows.forEach(line => {
        const cols = line.split(',');
        if (cols[1]?.replace(/"/g,'').trim() === label) {
          const lcp = parseFloat(cols[6]);
          if (!isNaN(lcp) && lcp >= 0) validRows.push({
            ttfb: parseFloat(cols[3]), fcp: parseFloat(cols[4]),
            si: parseFloat(cols[5]), lcp, tbt: parseFloat(cols[7]), cls: parseFloat(cols[8])
          });
        }
      });
      if (validRows.length > 0) {
        const avg = key => (validRows.reduce((s, r) => s + r[key], 0) / validRows.length).toFixed(1);
        console.log(`  Summary (n=${validRows.length})`);
        console.log(`  TTFB: ${avg('ttfb')}ms | FCP: ${avg('fcp')}ms | SI: ${avg('si')}ms`);
        console.log(`  LCP:  ${avg('lcp')}ms  | TBT: ${avg('tbt')}ms | CLS: ${avg('cls')}`);
      }

      const timingLine = `${label}: ${configDurationS}s`;
      timingLines.push(timingLine);
      console.log(`[DONE ${expIdx + 1}/${EXPERIMENTS.length}] ${label} — ${configDurationS}s`);
    }

  } finally {
    await browser.close();
  }

  const totalDurationS = ((Date.now() - startTime) / 1000).toFixed(1);
  timingLines.push('');
  timingLines.push(`Total benchmark duration: ${totalDurationS}s`);
  timingLines.push(`Total runs completed: ${totalRuns}`);
  timingLines.push(`Output CSV: ${path.basename(outputCsvPath)}`);

  fs.writeFileSync(timingPath, timingLines.join('\n') + '\n');

  console.log(`\n✓ Benchmark complete`);
  console.log(`  Results: ${outputCsvPath}`);
  console.log(`  Timing:  ${timingPath}`);
  console.log(`  Total duration: ${totalDurationS}s\n`);
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
