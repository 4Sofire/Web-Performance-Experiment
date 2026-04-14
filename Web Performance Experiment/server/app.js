require('dotenv').config();
const express = require('express');
const path    = require('path');
const zlib    = require('zlib');
const { runQuery }    = require('./db');
const { generateHTML } = require('./html-generator');

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

// ── In-memory server-side cache (used by B3='enabled') ───────────────────────
// Key: full query string. Value: { html, headers }
const pageCache = new Map();

// ── Static assets (JS, CSS, images) ──────────────────────────────────────────
// These are served without Cache-Control interference from the B3 factor —
// only the main HTML document is affected by caching config.
app.use('/static', express.static(path.join(__dirname, '../public')));

// ── Main test page ─────────────────────────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    // ── Parse factor configuration from query string ──────────────────────
    const config = {
      // Front-end factors
      f1: parseInt(req.query.f1)  || 0,           // JS payload KB: 0|100|500|1000
      f2: parseInt(req.query.f2)  || 0,           // Blocking CSS count: 0|1|3
      f3: req.query.f3            || 'jpeg',       // Image format: jpeg|webp|avif
      f4: req.query.f4            || 'disabled',   // Lazy loading: disabled|enabled
      f5: req.query.f5            || 'single',     // Code splitting: single|split
      // Back-end factors
      b1: parseInt(req.query.b1)  || 0,           // Server delay ms: 0|200|500|1000
      b2: req.query.b2            || 'none',       // DB query: none|simple|complex
      b3: req.query.b3            || 'disabled',   // Caching: disabled|enabled
      b4: req.query.b4            || 'none',       // Compression: none|gzip|brotli
    };

    // ── B3: Check server-side cache before any processing ────────────────
    const cacheKey = req.url;
    if (config.b3 === 'enabled' && pageCache.has(cacheKey)) {
      const cached = pageCache.get(cacheKey);
      res.set(cached.headers);
      return res.end(cached.body);
    }

    // ── B1: Artificial server processing delay ────────────────────────────
    if (config.b1 > 0) {
      await new Promise(resolve => setTimeout(resolve, config.b1));
    }

    // ── B2: Database query ────────────────────────────────────────────────
    const dbRows = await runQuery(config.b2);

    // ── Generate HTML (front-end factors F1–F5 applied here) ─────────────
    const html = generateHTML(config, dbRows);

    // ── B3: Cache-Control headers ─────────────────────────────────────────
    const cacheHeader = config.b3 === 'enabled'
      ? 'public, max-age=3600'
      : 'no-store, no-cache';

    // ── B4: Response compression ──────────────────────────────────────────
    const acceptEncoding = req.headers['accept-encoding'] || '';
    const htmlBuffer = Buffer.from(html, 'utf8');

    const sendResponse = async () => {
      if (config.b4 === 'gzip' && acceptEncoding.includes('gzip')) {
        const compressed = await new Promise((resolve, reject) =>
          zlib.gzip(htmlBuffer, (err, buf) => err ? reject(err) : resolve(buf))
        );
        const headers = {
          'Content-Type':     'text/html; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Cache-Control':    cacheHeader,
        };
        if (config.b3 === 'enabled') {
          pageCache.set(cacheKey, { headers, body: compressed });
        }
        res.set(headers).end(compressed);

      } else if (config.b4 === 'brotli' && acceptEncoding.includes('br')) {
        const compressed = await new Promise((resolve, reject) =>
          zlib.brotliCompress(htmlBuffer, (err, buf) => err ? reject(err) : resolve(buf))
        );
        const headers = {
          'Content-Type':     'text/html; charset=utf-8',
          'Content-Encoding': 'br',
          'Cache-Control':    cacheHeader,
        };
        if (config.b3 === 'enabled') {
          pageCache.set(cacheKey, { headers, body: compressed });
        }
        res.set(headers).end(compressed);

      } else {
        // No compression (none, or client doesn't support requested encoding)
        const headers = {
          'Content-Type':  'text/html; charset=utf-8',
          'Cache-Control': cacheHeader,
        };
        if (config.b3 === 'enabled') {
          pageCache.set(cacheKey, { headers, body: htmlBuffer });
        }
        res.set(headers).end(htmlBuffer);
      }
    };

    await sendResponse();

  } catch (err) {
    console.error('Request error:', err);
    res.status(500).send(`<h1>Server Error</h1><pre>${err.message}</pre>`);
  }
});

// ── Cache management endpoint (used by benchmark runner before B3 tests) ──
app.delete('/cache', (req, res) => {
  pageCache.clear();
  res.json({ cleared: true, timestamp: Date.now() });
});

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', cacheSize: pageCache.size });
});

app.listen(PORT, () => {
  console.log(`\nWeb Performance Experiment Server`);
  console.log(`──────────────────────────────────`);
  console.log(`Listening on: http://localhost:${PORT}`);
  console.log(`Test URL:     http://localhost:${PORT}/?f1=0&f2=0&f3=jpeg&f4=disabled&f5=single&b1=0&b2=none&b3=disabled&b4=none`);
  console.log(`Health check: http://localhost:${PORT}/health\n`);
});

module.exports = app;
