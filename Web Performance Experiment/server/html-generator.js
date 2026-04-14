"use strict";

/**
 * html-generator.js
 *
 * Dynamically builds the test page HTML on every request.
 * All front-end factors (F1–F5) are applied here.
 * All styling is inline CSS — no external stylesheets are introduced by the
 * page itself, so F2 (render-blocking resources) remains a controlled variable.
 *
 * The baseline page is intentionally heavy and realistic:
 *   - Navigation bar with links
 *   - Hero section with a large image
 *   - 4 metric summary cards
 *   - 8-paragraph article body
 *   - 6-image gallery grid
 *   - Experimental factors reference table
 *   - 3 findings panels
 *   - Methodology note footer
 *
 * This ensures that performance differences between configurations are
 * measurable against a non-trivial starting point.
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

/**
 * generateHTML(config, dbRows) → string
 *
 * @param {Object} config   Resolved factor configuration (all 9 factors)
 * @param {Array}  dbRows   Rows returned by the DB query (B2 factor)
 * @returns {string}        Complete HTML document
 */
function generateHTML(config, dbRows) {
  const { f1, f2, f3, f4, f5, b1, b2, b3, b4 } = config;

  // ── F2: Render-blocking stylesheet links ────────────────────────────────
  let blockingCSS = "";
  for (let i = 1; i <= f2; i++) {
    blockingCSS += `  <link rel="stylesheet" href="/static/css/blocking-${i}.css">\n`;
  }

  // ── F1 + F5: JavaScript payload / code splitting ────────────────────────
  let scriptTags = "";
  if (f5 === "split") {
    // Code splitting: load three separate chunks
    scriptTags = `
  <script src="/static/js/chunk-a.js" defer></script>
  <script src="/static/js/chunk-b.js" defer></script>
  <script src="/static/js/chunk-c.js" defer></script>`;
  } else {
    // Single bundle — include payload if f1 > 0, otherwise load app-bundle
    if (f1 > 0) {
      scriptTags = `\n  <script src="/static/js/payload-${f1}kb.js" defer></script>`;
    } else {
      scriptTags = `\n  <script src="/static/js/app-bundle.js" defer></script>`;
    }
  }

  // ── F3: Image format ─────────────────────────────────────────────────────
  const fmt = f3; // 'jpeg' | 'webp' | 'avif'
  const heroSrc = `/static/images/hero.${fmt}`;
  const gallerySrc = (n) => `/static/images/gallery-${n}.${fmt}`;

  // ── F4: Lazy loading attribute ───────────────────────────────────────────
  const lazyAttr = f4 === "enabled" ? ' loading="lazy"' : "";

  // ── B2: Database rows rendered into table ────────────────────────────────
  let dbSection = "";
  if (dbRows && dbRows.length > 0) {
    const headers = Object.keys(dbRows[0]);
    const headerRow = headers
      .map(
        (h) =>
          `<th style="padding:6px 12px;border:1px solid #ccc;background:#f5f5f5;text-align:left;">${h}</th>`,
      )
      .join("");
    const bodyRows = dbRows
      .map(
        (row) =>
          `<tr>${headers.map((h) => `<td style="padding:6px 12px;border:1px solid #ccc;">${row[h] !== null && row[h] !== undefined ? String(row[h]).substring(0, 60) : ""}</td>`).join("")}</tr>`,
      )
      .join("\n");
    dbSection = `
    <section style="margin:32px 0;">
      <h2 style="font-size:1.3rem;color:#1a202c;margin-bottom:12px;">Database Query Results <span style="font-size:0.85rem;color:#718096;font-weight:400;">(B2: ${b2})</span></h2>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;font-size:0.875rem;width:100%;">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </section>`;
  }

  // ── Active configuration badge ────────────────────────────────────────────
  const configBadge = `f1=${f1} f2=${f2} f3=${f3} f4=${f4} f5=${f5} b1=${b1} b2=${b2} b3=${b3} b4=${b4}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Web Performance Experiment</title>
${blockingCSS}${scriptTags}
</head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f8fa;color:#2d3748;">

  <!-- Navigation -->
  <nav style="background:#1a202c;color:#fff;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:56px;position:sticky;top:0;z-index:100;">
    <span style="font-weight:700;font-size:1rem;letter-spacing:0.02em;">WebPerf Lab</span>
    <div style="display:flex;gap:24px;font-size:0.875rem;">
      <a href="#overview" style="color:#a0aec0;text-decoration:none;">Overview</a>
      <a href="#findings" style="color:#a0aec0;text-decoration:none;">Findings</a>
      <a href="#gallery" style="color:#a0aec0;text-decoration:none;">Gallery</a>
      <a href="#factors" style="color:#a0aec0;text-decoration:none;">Factors</a>
      <a href="#methodology" style="color:#a0aec0;text-decoration:none;">Methodology</a>
    </div>
  </nav>

  <!-- Config badge -->
  <div style="background:#2d3748;color:#68d391;font-family:monospace;font-size:0.75rem;padding:6px 24px;letter-spacing:0.03em;">
    Active config: ${configBadge}
  </div>

  <main style="max-width:1080px;margin:0 auto;padding:32px 24px;">

    <!-- Hero -->
    <section id="overview" style="margin-bottom:40px;">
      <img
        src="${heroSrc}"
        alt="Web performance experiment hero image"
        width="1080"
        height="400"
        ${lazyAttr}
        style="width:100%;height:400px;object-fit:cover;border-radius:12px;display:block;">
      <h1 style="margin-top:28px;font-size:2rem;font-weight:800;color:#1a202c;line-height:1.2;">
        A Controlled Experimental Evaluation of<br>Front-End and Back-End Factors Affecting Web Page Performance
      </h1>
      <p style="color:#718096;font-size:1rem;margin-top:8px;">
        A controlled OFAT experiment evaluating the individual impact of front-end and back-end factors on web page performance using Google Lighthouse.
      </p>
    </section>

    <!-- Metric summary cards -->
    <section style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:40px;">
      ${metricCard("TTFB", "≤ 800ms", "#3182ce", "Time to First Byte")}
      ${metricCard("FCP", "≤ 1800ms", "#38a169", "First Contentful Paint")}
      ${metricCard("LCP", "≤ 2500ms", "#d69e2e", "Largest Contentful Paint")}
      ${metricCard("TBT", "≤ 200ms", "#e53e3e", "Total Blocking Time")}
      ${metricCard("SI", "≤ 3400ms", "#805ad5", "Speed Index")}
      ${metricCard("CLS", "≤ 0.1", "#dd6b20", "Cumulative Layout Shift")}
    </section>

    <!-- Article body -->
    <article id="findings" style="margin-bottom:40px;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,0.07);">
      <h2 style="font-size:1.5rem;color:#1a202c;margin-top:0;">Experimental Overview</h2>

      <p style="line-height:1.75;color:#4a5568;">
        This study conducts a controlled experimental evaluation of nine web performance factors spanning both front-end and back-end domains. The core academic contribution is the use of a One-Factor-At-a-Time (OFAT) methodology to isolate the individual effect of each factor under identical baseline conditions, enabling direct comparison of their relative influence on Google Lighthouse performance metrics.
      </p>

      <p style="line-height:1.75;color:#4a5568;">
        Prior literature has examined web performance broadly, but few studies have systematically varied individual front-end and back-end factors independently under controlled experimental conditions. This project addresses that gap by defining a precise baseline configuration and varying exactly one factor per experimental run while holding all others constant.
      </p>

      <h3 style="font-size:1.1rem;color:#2d3748;margin-top:24px;">Front-End Factors</h3>
      <p style="line-height:1.75;color:#4a5568;">
        Five front-end factors were selected based on their prevalence in web performance literature and their practical relevance to real-world web development: JavaScript payload size (F1), render-blocking resources (F2), image format (F3), image lazy loading (F4), and code splitting (F5). Each factor was varied across two or more levels to capture a meaningful range of conditions.
      </p>

      <p style="line-height:1.75;color:#4a5568;">
        JavaScript payload size is measured in kilobytes of synchronous script loaded in the document head. Three non-baseline levels are tested: 100KB, 500KB, and 1000KB. A progressive relationship is expected between payload size and LCP, with larger payloads requiring more parse and execution time before the page can render.
      </p>

      <p style="line-height:1.75;color:#4a5568;">
        Render-blocking resources are introduced as external CSS stylesheets loaded synchronously in the document head. One and three stylesheets are tested. Blocking stylesheets prevent the browser from rendering any content until they are fully downloaded and parsed, making them a key contributor to delayed first paint metrics.
      </p>

      <p style="line-height:1.75;color:#4a5568;">
        Image format comparisons are conducted between JPEG, WebP, and AVIF. Modern formats such as WebP and AVIF typically achieve smaller file sizes than JPEG for photographic content, which is expected to reduce LCP by decreasing the time needed to download the largest visible element on the page.
      </p>

      <h3 style="font-size:1.1rem;color:#2d3748;margin-top:24px;">Back-End Factors</h3>
      <p style="line-height:1.75;color:#4a5568;">
        Four back-end factors were evaluated: server processing delay (B1), database query complexity (B2), caching configuration (B3), and response compression (B4). Back-end factors were assessed primarily through Time to First Byte (TTFB), with LCP providing a secondary view of overall perceived load impact.
      </p>

      <p style="line-height:1.75;color:#4a5568;">
        Server processing delay directly adds latency before the server begins sending any response. Three levels are tested: 200ms, 500ms, and 1000ms. This factor is expected to have a near-direct 1:1 relationship with TTFB, making it a reliable test of the benchmarking system's ability to detect controlled differences.
      </p>

      <p style="line-height:1.75;color:#4a5568;">
        Caching (B3) stores the generated HTML response in server memory so that subsequent requests are served without re-executing the page generation logic or database queries. This is expected to reduce TTFB and LCP compared to the uncached baseline.
      </p>

      <p style="line-height:1.75;color:#4a5568;">
        Response compression reduces the number of bytes transferred over the network by encoding the HTML response using Gzip or Brotli before sending it to the browser. Brotli typically achieves better compression ratios than Gzip but at a higher computational cost, which may result in a small TTFB trade-off.
      </p>
    </article>

    <!-- Gallery -->
    <section id="gallery" style="margin-bottom:40px;">
      <h2 style="font-size:1.3rem;color:#1a202c;margin-bottom:16px;">Image Gallery <span style="font-size:0.85rem;color:#718096;font-weight:400;">(F3: ${f3}${f4 === "enabled" ? ", F4: lazy" : ""})</span></h2>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        ${[1, 2, 3, 4, 5, 6]
          .map(
            (n) => `
        <img
          src="${gallerySrc(n)}"
          alt="Gallery image ${n}"
          width="340"
          height="220"
          ${lazyAttr}
          style="width:100%;height:220px;object-fit:cover;border-radius:8px;display:block;">`,
          )
          .join("")}
      </div>
    </section>

    <!-- Experimental factors table -->
    <section id="factors" style="margin-bottom:40px;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,0.07);">
      <h2 style="font-size:1.3rem;color:#1a202c;margin-top:0;">Experimental Factors</h2>
      <table style="width:100%;border-collapse:collapse;font-size:0.875rem;">
        <thead>
          <tr style="background:#edf2f7;">
            <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#4a5568;">ID</th>
            <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#4a5568;">Domain</th>
            <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#4a5568;">Factor</th>
            <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#4a5568;">Levels</th>
            <th style="padding:10px 14px;border:1px solid #e2e8f0;text-align:left;color:#4a5568;">Active</th>
          </tr>
        </thead>
        <tbody>
          ${factorRow("F1", "Front-end", "JavaScript Payload Size", "0KB / 100KB / 500KB / 1000KB", f1 + "KB")}
          ${factorRow("F2", "Front-end", "Render-Blocking Resources", "0 / 1 / 3 stylesheets", f2 + " sheets")}
          ${factorRow("F3", "Front-end", "Image Format", "JPEG / WebP / AVIF", f3)}
          ${factorRow("F4", "Front-end", "Image Lazy Loading", "Disabled / Enabled", f4)}
          ${factorRow("F5", "Front-end", "Code Splitting", "Single bundle / Split chunks", f5)}
          ${factorRow("B1", "Back-end", "Server Processing Delay", "0ms / 200ms / 500ms / 1000ms", b1 + "ms")}
          ${factorRow("B2", "Back-end", "Database Query Complexity", "None / Simple / Complex join", b2)}
          ${factorRow("B3", "Back-end", "Caching Configuration", "Disabled / Enabled", b3)}
          ${factorRow("B4", "Back-end", "Response Compression", "None / Gzip / Brotli", b4)}
        </tbody>
      </table>
    </section>

    <!-- Findings panels -->
    <section style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:40px;">
      ${findingPanel("F1: JavaScript Payload", "Larger JavaScript payloads increase parse and execution time before rendering can begin. This factor is expected to show the strongest progressive relationship with LCP among all front-end factors tested.", "#3182ce")}
      ${findingPanel("B1: Server Delay", "Artificial server processing delay adds directly to TTFB before any content is sent to the browser. This factor serves as a key validation of the benchmarking system's ability to detect controlled performance differences.", "#e53e3e")}
      ${findingPanel("B3: Caching", "Server-side caching eliminates repeated page generation and database queries for identical requests. This is expected to produce the most consistent reduction in TTFB and LCP among all back-end configurations tested.", "#38a169")}
    </section>

    ${dbSection}

    <!-- Methodology note -->
    <section id="methodology" style="background:#edf2f7;border-radius:12px;padding:24px 32px;margin-bottom:40px;">
      <h2 style="font-size:1.1rem;color:#2d3748;margin-top:0;">Methodology Note</h2>
      <p style="line-height:1.75;color:#4a5568;margin:0;">
        All measurements were collected using Google Lighthouse v11 via automated Puppeteer-based browser control, running 50 audits per configuration. The OFAT design ensures that each reported effect is attributable to a single factor in isolation. No network throttling was applied — the experiment operates under controlled local conditions to eliminate network variability. Combined configurations (RQ5) were derived automatically from OFAT results by selecting the two least-damaging front-end factors and the two most-improving back-end factors.
      </p>
    </section>

  </main>

  <footer style="background:#1a202c;color:#718096;text-align:center;padding:20px;font-size:0.8rem;">
    Web Performance Experiment &nbsp;·&nbsp; OFAT Controlled Study &nbsp;·&nbsp; Powered by Google Lighthouse
  </footer>

</body>
</html>`;
}

// ── Helper: metric summary card ─────────────────────────────────────────────
function metricCard(name, threshold, color, fullName) {
  return `<div style="background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.07);border-top:4px solid ${color};">
        <div style="font-size:1.5rem;font-weight:800;color:${color};">${name}</div>
        <div style="font-size:0.8rem;color:#718096;margin-top:2px;">${fullName}</div>
        <div style="font-size:0.9rem;font-weight:600;color:#2d3748;margin-top:8px;">Good: ${threshold}</div>
      </div>`;
}

// ── Helper: factor table row ─────────────────────────────────────────────────
function factorRow(id, domain, factor, levels, active) {
  return `<tr>
            <td style="padding:8px 14px;border:1px solid #e2e8f0;font-weight:600;color:#3182ce;">${id}</td>
            <td style="padding:8px 14px;border:1px solid #e2e8f0;color:#718096;">${domain}</td>
            <td style="padding:8px 14px;border:1px solid #e2e8f0;">${factor}</td>
            <td style="padding:8px 14px;border:1px solid #e2e8f0;color:#718096;font-size:0.8rem;">${levels}</td>
            <td style="padding:8px 14px;border:1px solid #e2e8f0;font-family:monospace;font-size:0.8rem;color:#2d3748;">${active}</td>
          </tr>`;
}

// ── Helper: finding panel ────────────────────────────────────────────────────
function findingPanel(title, text, color) {
  return `<div style="background:#fff;border-radius:10px;padding:22px;box-shadow:0 1px 4px rgba(0,0,0,0.07);border-left:4px solid ${color};">
        <h3 style="margin:0 0 10px;font-size:0.95rem;color:${color};">${title}</h3>
        <p style="margin:0;font-size:0.875rem;line-height:1.65;color:#4a5568;">${text}</p>
      </div>`;
}

module.exports = { generateHTML };
