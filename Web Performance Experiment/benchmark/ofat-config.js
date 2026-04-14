/**
 * ofat-config.js
 *
 * One-Factor-At-a-Time (OFAT) experiment configuration.
 *
 * Total configurations: 18 (1 baseline + 17 non-baseline factor levels).
 *
 * The runner automatically detects which configurations are already
 * complete and skips them on resume. No manual editing needed.
 */

const BASELINE = {
  f1: 0,
  f2: 0,
  f3: 'jpeg',
  f4: 'disabled',
  f5: 'single',
  b1: 0,
  b2: 'none',
  b3: 'disabled',
  b4: 'none',
};

const EXPERIMENTS = [

  // Baseline
  { factor: 'BASELINE', label: 'Baseline (all defaults)', params: {} },

  // F1: JavaScript Payload Size
  { factor: 'F1', label: 'F1 - JS 100KB',  params: { f1: 100  } },
  { factor: 'F1', label: 'F1 - JS 500KB',  params: { f1: 500  } },
  { factor: 'F1', label: 'F1 - JS 1000KB', params: { f1: 1000 } },

  // F2: Render-Blocking Resources
  { factor: 'F2', label: 'F2 - 1 blocking stylesheet',  params: { f2: 1 } },
  { factor: 'F2', label: 'F2 - 3 blocking stylesheets', params: { f2: 3 } },

  // F3: Image Format
  { factor: 'F3', label: 'F3 - Image format: WebP', params: { f3: 'webp' } },
  { factor: 'F3', label: 'F3 - Image format: AVIF', params: { f3: 'avif' } },

  // F4: Image Lazy Loading
  { factor: 'F4', label: 'F4 - Lazy loading: enabled', params: { f4: 'enabled' } },

  // F5: Code Splitting
  { factor: 'F5', label: 'F5 - Code splitting: split chunks', params: { f5: 'split' } },

  // B1: Server Processing Delay
  { factor: 'B1', label: 'B1 - Server delay: 200ms',  params: { b1: 200  } },
  { factor: 'B1', label: 'B1 - Server delay: 500ms',  params: { b1: 500  } },
  { factor: 'B1', label: 'B1 - Server delay: 1000ms', params: { b1: 1000 } },

  // B2: Database Query Complexity
  { factor: 'B2', label: 'B2 - DB query: simple',  params: { b2: 'simple'  } },
  { factor: 'B2', label: 'B2 - DB query: complex', params: { b2: 'complex' } },

  // B3: Caching Configuration
  { factor: 'B3', label: 'B3 - Caching: enabled', params: { b3: 'enabled' } },

  // B4: Response Compression
  { factor: 'B4', label: 'B4 - Compression: gzip',   params: { b4: 'gzip'   } },
  { factor: 'B4', label: 'B4 - Compression: brotli', params: { b4: 'brotli' } },

];

function buildConfig(params) {
  return { ...BASELINE, ...params };
}

function configToQueryString(config) {
  return Object.entries(config)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

module.exports = { BASELINE, EXPERIMENTS, buildConfig, configToQueryString };
