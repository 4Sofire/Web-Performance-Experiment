'use strict';

/**
 * analyse.js
 *
 * Statistical analysis of benchmark results.
 *
 * Reads all results-*.csv files from the results/ folder, applies smart merge
 * logic to produce a clean master-results.csv (540–1,050 rows), then computes
 * descriptive and inferential statistics across all 6 Lighthouse metrics.
 *
 * Output files (all timestamped):
 *   master-results.csv          — merged raw data (all runs)
 *   descriptive-stats-*.csv     — mean, median, SD, CI95, min, max, IQR, skewness
 *   inferential-stats-*.csv     — Welch's t-test vs baseline (p-value, significance)
 *   summary-*.csv               — human-readable combined overview
 *
 * Usage:
 *   npm run analyse
 */

const fs   = require('fs');
const path = require('path');

const RESULTS_DIR    = path.join(__dirname, '../results');
const MASTER_CSV     = path.join(RESULTS_DIR, 'master-results.csv');
const RUNS_PER_CONFIG = 50;
const METRICS = ['ttfb_ms', 'fcp_ms', 'speed_index_ms', 'lcp_ms', 'tbt_ms', 'cls'];
const METRIC_LABELS = {
  ttfb_ms: 'TTFB', fcp_ms: 'FCP', speed_index_ms: 'SpeedIndex',
  lcp_ms: 'LCP', tbt_ms: 'TBT', cls: 'CLS',
};

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const cols = splitCSVLine(line);
    const row  = {};
    headers.forEach((h, i) => { row[h] = cols[i]?.replace(/^"|"$/g, '').trim() ?? ''; });
    return row;
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; }
    else if (c === ',' && !inQuote) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function toNum(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

// ── Smart merge logic ─────────────────────────────────────────────────────────
function getAllResultsCSVs() {
  return fs.readdirSync(RESULTS_DIR)
    .filter(f => f.startsWith('results-') && f.endsWith('.csv'))
    .sort()
    .map(f => path.join(RESULTS_DIR, f));
}

function getMostRecentCSV() {
  const files = getAllResultsCSVs();
  return files.length ? files[files.length - 1] : null;
}

function isComplete(rows) {
  const counts = {};
  rows.forEach(r => { counts[r.label] = (counts[r.label] || 0) + 1; });
  const labels = Object.keys(counts);
  return labels.length > 0 && labels.every(l => counts[l] >= RUNS_PER_CONFIG);
}

function buildMasterRows() {
  const allCSVs = getAllResultsCSVs();
  if (!allCSVs.length) { console.error('No results-*.csv found.'); process.exit(1); }

  // Separate OFAT and combined CSVs
  const ofatCSVs    = allCSVs.filter(f => !path.basename(f).startsWith('results-combined-'));
  // Use only the most recent combined CSV — never merge multiple combined runs
  // Only use a combined CSV generated AFTER the most recent complete OFAT CSV
  const allCombinedCSVs = allCSVs.filter(f => path.basename(f).startsWith('results-combined-'));
  const mostRecentOfatName = ofatCSVs.length ? path.basename(ofatCSVs[ofatCSVs.length - 1]) : null;
  const ofatTimestamp = mostRecentOfatName ? mostRecentOfatName.replace('results-', '').replace('.csv', '') : null;
  const validCombinedCSVs = allCombinedCSVs.filter(f => {
    const combinedTimestamp = path.basename(f).replace('results-combined-', '').replace('.csv', '');
    return ofatTimestamp ? combinedTimestamp > ofatTimestamp : true;
  });
  const combinedCSVs = validCombinedCSVs.length ? [validCombinedCSVs[validCombinedCSVs.length - 1]] : [];
  if (allCombinedCSVs.length > 0 && combinedCSVs.length === 0) {
    console.log(`Note: Combined CSV(s) found but all predate the current OFAT run — skipping. Run npm run benchmark-combined to generate new combined results.`);
  } else if (validCombinedCSVs.length > 1) {
    console.log(`Note: ${validCombinedCSVs.length} valid combined CSVs found — using most recent: ${path.basename(combinedCSVs[0])}`);
  }

  // Find the most recent complete OFAT CSV
  let ofatRows = [];
  let foundComplete = false;
  for (let i = ofatCSVs.length - 1; i >= 0; i--) {
    const rows = parseCSV(ofatCSVs[i]);
    if (isComplete(rows)) {
      ofatRows = rows;
      foundComplete = true;
      console.log(`Using complete OFAT CSV: ${path.basename(ofatCSVs[i])}`);
      break;
    }
  }
  if (!foundComplete && ofatCSVs.length) {
    ofatRows = parseCSV(ofatCSVs[ofatCSVs.length - 1]);
    console.log(`Using most recent OFAT CSV (incomplete): ${path.basename(ofatCSVs[ofatCSVs.length - 1])}`);
  }

  // Load combined rows from most recent file only
  const combinedRows = combinedCSVs.length ? parseCSV(combinedCSVs[0]) : [];
  if (combinedRows.length > 0) {
    console.log(`Combined CSV loaded: ${path.basename(combinedCSVs[0])} (${combinedRows.length} rows)`);
  }
  const dedupedCombined = combinedRows;

  const allRows = [...ofatRows, ...dedupedCombined];
  console.log(`Total rows: ${allRows.length} (OFAT: ${ofatRows.length}, Combined: ${dedupedCombined.length})`);
  return allRows;
}

// ── Statistics ────────────────────────────────────────────────────────────────
function mean(arr)   { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function variance(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}
function sd(arr) { return Math.sqrt(variance(arr)); }
function ci95(arr) { return 1.96 * sd(arr) / Math.sqrt(arr.length); }
function iqr(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  return q3 - q1;
}
function skewness(arr) {
  const m  = mean(arr);
  const s3 = arr.reduce((acc, v) => acc + (v - m) ** 3, 0) / arr.length;
  return s3 / (sd(arr) ** 3);
}

/**
 * Welch's two-sample t-test (two-tailed).
 * Returns { t, df, p, significant }
 */
function welchTTest(a, b) {
  if (a.length < 2 || b.length < 2) return { t: 0, df: 0, p: 1, significant: false };
  const ma = mean(a), mb = mean(b);
  const va = variance(a), vb = variance(b);
  const na = a.length, nb = b.length;
  const se = Math.sqrt(va / na + vb / nb);
  if (se === 0) return { t: 0, df: 0, p: 1, significant: false };
  const t  = (ma - mb) / se;
  const df = (va / na + vb / nb) ** 2 /
    ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  const p  = tDist(Math.abs(t), df);
  return { t: round(t, 4), df: round(df, 1), p: round(p, 6), significant: p < 0.05 };
}

// Approximation of two-tailed p-value from t and df
function tDist(t, df) {
  const x = df / (df + t * t);
  return incompleteBeta(df / 2, 0.5, x);
}

function incompleteBeta(a, b, x) {
  // Continued fraction approximation (Lentz's method)
  if (x < 0 || x > 1) return 0;
  if (x === 0) return 1;
  if (x === 1) return 0;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const coef  = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  return coef * betaCF(a, b, x) / a;
}

function betaCF(a, b, x) {
  const MAXIT = 200, EPS = 3e-7;
  let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    let aa = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    h *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function lgamma(z) {
  const c = [76.18009172947146,-86.50532032941677,24.01409824083091,
    -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y = z, x = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function round(v, dp) { return Math.round(v * 10 ** dp) / 10 ** dp; }

// ── CSV writer ────────────────────────────────────────────────────────────────
function writeCSV(filePath, headers, rows) {
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => {
    const v = String(r[h] ?? '');
    return v.includes(',') ? `"${v}"` : v;
  }).join(',')));
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(RESULTS_DIR)) { console.error('results/ folder not found.'); process.exit(1); }

  const masterRows = buildMasterRows();

  // Save master CSV
  const masterHeader = 'factor,label,run,ttfb_ms,fcp_ms,speed_index_ms,lcp_ms,tbt_ms,cls,audit_duration_ms,config_duration_s,url\n';
  const masterLines  = masterRows.map(r =>
    [r.factor, r.label, r.run, r.ttfb_ms, r.fcp_ms, r.speed_index_ms, r.lcp_ms, r.tbt_ms, r.cls,
      r.audit_duration_ms, r.config_duration_s, r.url].join(',')
  );
  fs.writeFileSync(MASTER_CSV, masterHeader + masterLines.join('\n') + '\n');
  console.log(`master-results.csv written (${masterRows.length} rows)`);

  // Group rows by label
  const groups = {};
  masterRows.forEach(r => {
    if (!groups[r.label]) groups[r.label] = { factor: r.factor, rows: [] };
    groups[r.label].rows.push(r);
  });

  const labels = Object.keys(groups);
  const baselineLabel = labels.find(l => l.toLowerCase().includes('baseline'));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // ── Descriptive stats ────────────────────────────────────────────────────
  const descHeaders = ['factor', 'label', 'n',
    ...METRICS.flatMap(m => {
      const s = METRIC_LABELS[m];
      return [`${s}_mean`, `${s}_median`, `${s}_sd`, `${s}_ci95`,
              `${s}_min`, `${s}_max`, `${s}_iqr`, `${s}_skewness`];
    }),
    'avg_audit_ms', 'total_config_s',
  ];

  const descRows = labels.map(label => {
    const { factor, rows } = groups[label];
    const row = { factor, label, n: rows.length };

    METRICS.forEach(m => {
      const vals = rows.map(r => toNum(r[m])).filter(v => v !== null);
      const s    = METRIC_LABELS[m];
      row[`${s}_mean`]     = round(mean(vals), 2);
      row[`${s}_median`]   = round(median(vals), 2);
      row[`${s}_sd`]       = round(sd(vals), 2);
      row[`${s}_ci95`]     = round(ci95(vals), 2);
      row[`${s}_min`]      = round(Math.min(...vals), 2);
      row[`${s}_max`]      = round(Math.max(...vals), 2);
      row[`${s}_iqr`]      = round(iqr(vals), 2);
      row[`${s}_skewness`] = round(skewness(vals), 4);
    });

    const auditMs = rows.map(r => toNum(r.audit_duration_ms)).filter(v => v !== null);
    row.avg_audit_ms   = round(mean(auditMs), 0);
    row.total_config_s = round(rows.reduce((s, r) => s + (toNum(r.config_duration_s) || 0), 0) / rows.length, 1);
    return row;
  });

  const descPath = path.join(RESULTS_DIR, `descriptive-stats-${timestamp}.csv`);
  writeCSV(descPath, descHeaders, descRows);
  console.log(`descriptive-stats written`);

  // ── Inferential stats (Welch's t-test vs baseline) ───────────────────────
  const infHeaders = ['factor', 'label',
    ...METRICS.flatMap(m => {
      const s = METRIC_LABELS[m];
      return [`${s}_t`, `${s}_df`, `${s}_p`, `${s}_sig`, `${s}_mean_diff`];
    }),
  ];

  const baselineRows = baselineLabel ? groups[baselineLabel].rows : null;

  const infRows = labels.map(label => {
    const { factor, rows } = groups[label];
    const row = { factor, label };

    METRICS.forEach(m => {
      const s    = METRIC_LABELS[m];
      const vals = rows.map(r => toNum(r[m])).filter(v => v !== null);

      if (!baselineRows || label === baselineLabel) {
        row[`${s}_t`]         = 'N/A';
        row[`${s}_df`]        = 'N/A';
        row[`${s}_p`]         = 'N/A';
        row[`${s}_sig`]       = 'N/A';
        row[`${s}_mean_diff`] = '0.00';
      } else {
        const bVals = baselineRows.map(r => toNum(r[m])).filter(v => v !== null);
        const test  = welchTTest(vals, bVals);
        row[`${s}_t`]         = test.t;
        row[`${s}_df`]        = test.df;
        row[`${s}_p`]         = test.p;
        row[`${s}_sig`]       = test.significant ? 'Yes' : 'No';
        row[`${s}_mean_diff`] = round(mean(vals) - mean(bVals), 2);
      }
    });
    return row;
  });

  const infPath = path.join(RESULTS_DIR, `inferential-stats-${timestamp}.csv`);
  writeCSV(infPath, infHeaders, infRows);
  console.log(`inferential-stats written`);

  // ── Summary CSV ───────────────────────────────────────────────────────────
  const summaryHeaders = [
    'factor', 'label', 'n',
    'ttfb_mean', 'ttfb_sd', 'ttfb_ci95',
    'fcp_mean', 'fcp_sd', 'fcp_ci95',
    'lcp_mean', 'lcp_sd', 'lcp_ci95',
    'lcp_vs_baseline', 'ttfb_vs_baseline',
    'lcp_p_value', 'lcp_significant',
  ];

  const baseDesc = baselineLabel ? descRows.find(r => r.label === baselineLabel) : null;
  const baseInf  = baselineLabel ? infRows.find(r => r.label === baselineLabel) : null;

  const summaryRows = labels.map(label => {
    const d = descRows.find(r => r.label === label);
    const i = infRows.find(r => r.label === label);
    const { factor } = groups[label];
    return {
      factor, label,
      n:                 d.n,
      ttfb_mean:         d['TTFB_mean'], ttfb_sd: d['TTFB_sd'], ttfb_ci95: d['TTFB_ci95'],
      fcp_mean:          d['FCP_mean'],  fcp_sd:  d['FCP_sd'],  fcp_ci95:  d['FCP_ci95'],
      lcp_mean:          d['LCP_mean'],  lcp_sd:  d['LCP_sd'],  lcp_ci95:  d['LCP_ci95'],
      lcp_vs_baseline:   label === baselineLabel ? '0.00' : (i?.['LCP_mean_diff'] ?? 'N/A'),
      ttfb_vs_baseline:  label === baselineLabel ? '0.00' : (i?.['TTFB_mean_diff'] ?? 'N/A'),
      lcp_p_value:       label === baselineLabel ? 'N/A'  : (i?.['LCP_p'] ?? 'N/A'),
      lcp_significant:   label === baselineLabel ? 'N/A'  : (i?.['LCP_sig'] ?? 'N/A'),
    };
  });

  const summaryPath = path.join(RESULTS_DIR, `summary-${timestamp}.csv`);
  writeCSV(summaryPath, summaryHeaders, summaryRows);
  console.log(`summary written`);

  // ── Results summary table ─────────────────────────────────────────────────
  const colW = 14;
  const pad  = (s, w) => String(s).padStart(w);
  const padL = (s, w) => String(s).padEnd(w);

  console.log('\nRESULTS SUMMARY');
  console.log('='.repeat(130));
  console.log([
    padL('Label', 45),
    pad('TTFB (ms)', colW), pad('FCP (ms)', colW), pad('SI (ms)', colW),
    pad('LCP (ms)', colW),  pad('TBT (ms)', colW), pad('CLS', colW),
    pad('Avg Audit', colW), pad('n', 4),
  ].join('  '));
  console.log('-'.repeat(130));
  descRows.forEach(row => {
    console.log([
      padL(row.label, 45),
      pad(`${row['TTFB_mean']} +-${row['TTFB_ci95']}`, colW),
      pad(`${row['FCP_mean']} +-${row['FCP_ci95']}`,   colW),
      pad(`${row['SpeedIndex_mean']} +-${row['SpeedIndex_ci95']}`, colW),
      pad(`${row['LCP_mean']} +-${row['LCP_ci95']}`,   colW),
      pad(`${row['TBT_mean']} +-${row['TBT_ci95']}`,   colW),
      pad(`${row['CLS_mean']} +-${row['CLS_ci95']}`,   colW),
      pad(`${row.avg_audit_ms}ms`, colW),
      pad(row.n, 4),
    ].join('  '));
  });
  console.log('-'.repeat(130));
  console.log('Values shown as mean +- 95% CI | Avg Audit = average Lighthouse audit duration\n');

  // ── Audit duration summary ────────────────────────────────────────────────
  console.log('AUDIT DURATION SUMMARY');
  console.log('='.repeat(60));
  descRows.forEach(row => {
    console.log(`  ${row.label.padEnd(45)} avg: ${row.avg_audit_ms}ms  total: ${row.total_config_s}s`);
  });
  console.log('');

  // ── LCP threshold summary (dynamic — based on actual results) ────────────
  console.log('\nLCP THRESHOLDS (Google Core Web Vitals)');
  console.log('  <= 2500ms = Good  |  2500-4000ms = Needs Improvement  |  > 4000ms = Poor\n');
  descRows.forEach(row => {
    const lcp = parseFloat(row['LCP_mean']);
    if (isNaN(lcp)) return;
    const status = lcp <= 2500 ? 'Good'
                 : lcp <= 4000 ? 'Needs Improvement'
                 :               'Poor';
    console.log(`  ${status.padEnd(20)} ${row.label.padEnd(45)} LCP mean: ${lcp}ms`);
  });
  console.log('');

  console.log('\n✓ Analysis complete');
  console.log(`  master-results.csv`);
  console.log(`  descriptive-stats-${timestamp}.csv`);
  console.log(`  inferential-stats-${timestamp}.csv`);
  console.log(`  summary-${timestamp}.csv\n`);
}

main();
