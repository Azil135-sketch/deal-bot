/**
 * validateDeals.js
 *
 * Validates every manual URL in deals.json to catch "stale URL" situations —
 * e.g. Myntra reusing a product ID for a completely different item (the
 * Doormat problem: a hoodie URL now serves a doormat page).
 *
 * How it works:
 *   1. Fetch each product URL with a browser-like User-Agent.
 *   2. Extract the page's og:title / <title> / main h1.
 *   3. Compare key product words between the stored title and the live page title.
 *   4. LOW overlap (<25%) → REMOVED from deals.json.
 *      MEDIUM overlap (25-55%) → FLAGGED (kept but marked `stale: true`).
 *      HIGH overlap (≥55%) → OK.
 *   5. Write a timestamped report to data/validation_report.json.
 *   6. Save the cleaned deals.json.
 *
 * Usage:
 *   node src/validateDeals.js            # validate + auto-remove stale entries
 *   node src/validateDeals.js --flag-only  # flag but never remove (dry-run for review)
 *
 * Runs automatically every Sunday via .github/workflows/validate-deals.yml.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

// ─── Config ──────────────────────────────────────────────────────────────────
const DEALS_FILE   = process.env.DEALS_FILE   || path.join(__dirname, '../data/deals.json');
const REPORT_FILE  = process.env.REPORT_FILE  || path.join(__dirname, '../data/validation_report.json');
const FLAG_ONLY    = process.argv.includes('--flag-only');
const REMOVE_THRESHOLD = 25;   // overlap % below which a deal is removed
const FLAG_THRESHOLD   = 55;   // overlap % below which a deal is flagged

const TIMEOUT = 18000;
const DELAY_MS = 1200; // polite delay between requests

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

// ─── Noise words stripped before comparison ───────────────────────────────
const NOISE = new Set([
  'buy','online','india','offer','offers','deal','deals','off','discount','sale',
  'get','grab','free','shipping','cod','emi','with','and','or','for','the','a',
  'an','in','at','of','to','rs','inr','pack','combo','set','best','price','new',
  'latest','genuine','original','upto','up','use','code','extra','more','additional',
  'checkout','explore','shop','now','order','available','check','see','view',
  'review','reviews','rating','star','stars','certified','assured','delivered',
]);

function tokenize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !NOISE.has(w));
}

function overlapPct(titleA, titleB) {
  const aSet = new Set(tokenize(titleA));
  const bSet = new Set(tokenize(titleB));
  if (aSet.size === 0) return 0;
  let common = 0;
  for (const t of aSet) if (bSet.has(t)) common++;
  return Math.round((common / Math.max(aSet.size, bSet.size)) * 100);
}

// ─── Page-title extractors per platform ──────────────────────────────────
function extractTitle($, url) {
  // 1. og:title (most reliable)
  const og = $('meta[property="og:title"]').attr('content');
  if (og && og.trim().length > 4) return og.trim();

  // 2. twitter:title
  const tw = $('meta[name="twitter:title"]').attr('content');
  if (tw && tw.trim().length > 4) return tw.trim();

  // Myntra-specific: h1.pdp-name or .pdp-title
  if (url.includes('myntra')) {
    const h = $('h1.pdp-name, .pdp-title, h1').first().text().trim();
    if (h.length > 4) return h;
  }

  // Nykaa-specific
  if (url.includes('nykaa')) {
    const h = $('h1[class*="product"], h1[class*="title"], h1').first().text().trim();
    if (h.length > 4) return h;
  }

  // HealthKart-specific
  if (url.includes('healthkart')) {
    const h = $('h1[itemprop="name"], h1[class*="product"], h1').first().text().trim();
    if (h.length > 4) return h;
  }

  // 3. Fallback: <title> (strip site name suffix like " | Myntra")
  const t = $('title').text().trim().split(/\s*[\|·—–-]\s*/)[0].trim();
  if (t.length > 4) return t;

  return null;
}

// ─── Fetch a URL and return extracted title ───────────────────────────────
async function fetchTitle(url) {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      maxRedirects: 6,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      },
      validateStatus: s => s < 500,
    });

    if (res.status === 404) return { title: null, status: 404 };
    if (res.status >= 400) return { title: null, status: res.status };

    const $ = cheerio.load(res.data);
    const title = extractTitle($, url);
    return { title, status: res.status, finalUrl: res.request?.res?.responseUrl || url };
  } catch (err) {
    return { title: null, status: null, error: err.message };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(DEALS_FILE)) {
    console.error(`deals.json not found at ${DEALS_FILE}`);
    process.exit(1);
  }

  const raw   = fs.readFileSync(DEALS_FILE, 'utf8');
  const deals = JSON.parse(raw);
  console.log(`\n🔍 Validating ${deals.length} deal(s)…\n`);

  const report = {
    runAt:   new Date().toISOString(),
    mode:    FLAG_ONLY ? 'flag-only' : 'auto-remove',
    summary: { ok: 0, flagged: 0, removed: 0, unreachable: 0 },
    results: [],
  };

  const keep = [];

  for (const deal of deals) {
    const url = deal.productUrl;
    if (!url) {
      keep.push(deal);
      continue;
    }

    console.log(`  Checking [${deal.id}] ${deal.title.slice(0, 60)}…`);
    const { title: liveTitle, status, error } = await fetchTitle(url);

    let outcome, overlap = null, action = 'keep';

    if (!liveTitle) {
      // Unreachable or no parseable title — flag only, don't remove blindly
      outcome = 'unreachable';
      action  = 'flag';
      report.summary.unreachable++;
      console.log(`    ⚠️  Could not read title (status=${status ?? 'err'}: ${error || ''})`);
    } else {
      overlap = overlapPct(deal.title, liveTitle);

      if (overlap >= FLAG_THRESHOLD) {
        outcome = 'ok';
        action  = 'keep';
        report.summary.ok++;
        console.log(`    ✅  OK (${overlap}% match) — "${liveTitle.slice(0,60)}"`);
      } else if (overlap >= REMOVE_THRESHOLD) {
        outcome = 'flagged';
        action  = 'flag';
        report.summary.flagged++;
        console.log(`    🟡  FLAGGED (${overlap}% match)`);
        console.log(`        stored: "${deal.title.slice(0,60)}"`);
        console.log(`        live  : "${liveTitle.slice(0,60)}"`);
      } else {
        outcome = 'stale';
        action  = FLAG_ONLY ? 'flag' : 'remove';
        if (!FLAG_ONLY) report.summary.removed++;
        else            report.summary.flagged++;
        console.log(`    🔴  STALE — removed (${overlap}% match)`);
        console.log(`        stored: "${deal.title.slice(0,60)}"`);
        console.log(`        live  : "${liveTitle.slice(0,60)}"`);
      }
    }

    report.results.push({
      id:         deal.id,
      storedTitle: deal.title,
      liveTitle:  liveTitle || null,
      url,
      status,
      overlap,
      outcome,
      action,
    });

    if (action === 'remove') {
      // Don't push to keep[]
    } else {
      const updated = { ...deal };
      if (action === 'flag') updated.stale = true;
      else                   delete updated.stale; // clear old flag if now OK
      keep.push(updated);
    }

    await sleep(DELAY_MS);
  }

  // ─── Save cleaned deals.json ───────────────────────────────────────────
  fs.writeFileSync(DEALS_FILE, JSON.stringify(keep, null, 2), 'utf8');

  // ─── Save report ──────────────────────────────────────────────────────
  // Keep last 10 runs
  let history = [];
  if (fs.existsSync(REPORT_FILE)) {
    try { history = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); } catch (_) {}
    if (!Array.isArray(history)) history = [];
  }
  history.unshift(report);
  if (history.length > 10) history = history.slice(0, 10);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(history, null, 2), 'utf8');

  // ─── Summary ──────────────────────────────────────────────────────────
  const s = report.summary;
  console.log('\n──────────────────────────────────────────');
  console.log(`✅  OK          : ${s.ok}`);
  console.log(`🟡  Flagged     : ${s.flagged}`);
  console.log(`🔴  Removed     : ${s.removed}`);
  console.log(`⚠️   Unreachable : ${s.unreachable}`);
  console.log(`📄  Report      : ${REPORT_FILE}`);
  console.log('──────────────────────────────────────────\n');

  if (s.removed > 0 || s.flagged > 0) {
    process.exit(2); // signal to CI that changes were made
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
