/**
 * Stock Checker Module
 * Checks whether a product URL is actually in stock before broadcasting.
 *
 * Approach: fetch a small slice of the product page HTML and scan for
 * "out of stock" / "sold out" / "unavailable" signals specific to each store.
 * Returns { inStock: bool, reason: string } — never throws.
 *
 * Timeout is short (8s) so it never slows down the pipeline significantly.
 */

const axios = require('axios');
const logger = require('./logger');

const FETCH_TIMEOUT = 9000;
const MAX_BYTES = 150 * 1024; // 150KB — enough for <head> + first product section

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Cache: url -> { inStock, reason, checkedAt }
const stockCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Per-store out-of-stock patterns (regex tested against HTML).
 * Ordered: first match wins — most specific first.
 */
const STORE_OOS_PATTERNS = {
  'myntra.com': [
    /class="[^"]*pdp-out-of-stock/i,
    /"outOfStock"\s*:\s*true/i,
    /SOLD\s+OUT/i,
    /Out of Stock/i,
    /"stockStatus"\s*:\s*"OUT_OF_STOCK"/i,
    /"available"\s*:\s*false/i
  ],
  'ajio.com': [
    /class="[^"]*out-of-stock/i,
    /OUT OF STOCK/i,
    /"stockStatus"\s*:\s*"OUT_OF_STOCK"/i,
    /"isOutOfStock"\s*:\s*true/i
  ],
  'nykaa.com': [
    /Out of Stock/i,
    /class="[^"]*out-of-stock/i,
    /"inStock"\s*:\s*false/i,
    /"available"\s*:\s*false/i,
    /data-out-of-stock/i,
    // Nykaa shows "Notify Me" button when OOS
    /class="[^"]*notify-me/i
  ],
  'nykaa.in': [
    /Out of Stock/i,
    /"inStock"\s*:\s*false/i
  ],
  'tatacliq.com': [
    /OUT OF STOCK/i,
    /Sold Out/i,
    /"stockStatus"\s*:\s*"OOS"/i,
    /"available"\s*:\s*false/i
  ],
  'amazon.in': [
    /Currently unavailable/i,
    /out of stock/i,
    /id="outOfStock"/i,
    /"availability"\s*:\s*"OutOfStock"/i,
    /We don.t know when or if this item will be back in stock/i
  ],
  'flipkart.com': [
    /class="[^"]*out-of-stock/i,
    /Sold Out/i,
    /Out of Stock/i,
    /"in_stock"\s*:\s*false/i
  ],
  'meesho.com': [
    /Out of Stock/i,
    /"is_available"\s*:\s*false/i
  ],
  'croma.com': [
    /Out Of Stock/i,
    /class="[^"]*pdp__outOfStock/i,
    /"stockStatus"\s*:\s*"OUT_OF_STOCK"/i
  ],
  'reliancedigital.in': [
    /Out Of Stock/i,
    /Sold Out/i
  ],
  'snapdeal.com': [
    /Out of Stock/i,
    /"availability"\s*:\s*"OutOfStock"/i
  ],
  'healthkart.com': [
    /Out of Stock/i,
    /Sold Out/i,
    /"inStock"\s*:\s*false/i
  ],
  'netmeds.com': [
    /Out of Stock/i,
    /Sold Out/i
  ],
  'pharmeasy.in': [
    /Out of Stock/i,
    /Unavailable/i
  ],
  'tata1mg.com': [
    /Out of Stock/i,
    /Currently not available/i
  ],
  '1mg.com': [
    /Out of Stock/i,
    /Currently not available/i
  ]
};

// Generic fallback patterns for unknown stores
const GENERIC_OOS_PATTERNS = [
  /out[\s-]of[\s-]stock/i,
  /sold\s+out/i,
  /currently\s+unavailable/i,
  /not\s+available/i,
  /item\s+unavailable/i,
  /"availability"\s*:\s*"OutOfStock"/i,
  /"inStock"\s*:\s*false/i,
  /"available"\s*:\s*false/i,
  /"isAvailable"\s*:\s*false/i
];

// IN-STOCK signals — if found, confirms the product is live
const IN_STOCK_SIGNALS = [
  /add\s+to\s+(bag|cart|basket)/i,
  /"availability"\s*:\s*"InStock"/i,
  /"inStock"\s*:\s*true/i,
  /"available"\s*:\s*true/i,
  /"isAvailable"\s*:\s*true/i,
  /"stockStatus"\s*:\s*"IN_STOCK"/i,
  /class="[^"]*add-to-bag/i,
  /class="[^"]*add-to-cart/i
];

/**
 * Check if a product URL is in stock.
 * @param {string} url
 * @returns {Promise<{ inStock: boolean, reason: string }>}
 */
async function checkStock(url) {
  if (!url) return { inStock: false, reason: 'no_url' };

  // Return from cache if fresh
  const cached = stockCache.get(url);
  if (cached && (Date.now() - cached.checkedAt) < CACHE_TTL_MS) {
    return { inStock: cached.inStock, reason: cached.reason + '_cached' };
  }

  try {
    const resp = await axios.get(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9'
      },
      maxContentLength: MAX_BYTES,
      responseType: 'text',
      validateStatus: s => s < 500 // 200-499
    });

    // 404 = definitely out/deleted
    if (resp.status === 404) {
      _cacheResult(url, false, 'http_404');
      return { inStock: false, reason: 'http_404' };
    }

    // 4xx = bad link
    if (resp.status >= 400) {
      _cacheResult(url, false, `http_${resp.status}`);
      return { inStock: false, reason: `http_${resp.status}` };
    }

    const html = resp.data || '';
    const hostname = _getHostname(url);

    // Check for in-stock signals first (more reliable)
    for (const pattern of IN_STOCK_SIGNALS) {
      if (pattern.test(html)) {
        _cacheResult(url, true, 'in_stock_signal');
        return { inStock: true, reason: 'in_stock_signal' };
      }
    }

    // Check store-specific OOS patterns
    const storePatterns = _getStorePatterns(hostname);
    for (const pattern of storePatterns) {
      if (pattern.test(html)) {
        logger.debug(`OOS detected for ${url.slice(0, 60)}: ${pattern.source.slice(0, 40)}`);
        _cacheResult(url, false, 'oos_detected');
        return { inStock: false, reason: 'oos_detected' };
      }
    }

    // Generic OOS patterns
    for (const pattern of GENERIC_OOS_PATTERNS) {
      if (pattern.test(html)) {
        logger.debug(`Generic OOS signal for ${url.slice(0, 60)}`);
        _cacheResult(url, false, 'generic_oos');
        return { inStock: false, reason: 'generic_oos' };
      }
    }

    // No OOS signal found — assume in stock
    _cacheResult(url, true, 'no_oos_signal');
    return { inStock: true, reason: 'no_oos_signal' };

  } catch (error) {
    // Timeouts / network errors — don't drop the deal, assume valid
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      logger.debug(`Stock check timeout for ${url.slice(0, 60)} — assuming in stock`);
      return { inStock: true, reason: 'timeout_assumed_ok' };
    }
    if (error.response?.status === 404) {
      _cacheResult(url, false, 'http_404');
      return { inStock: false, reason: 'http_404' };
    }
    // Other errors — assume in stock to not drop potentially good deals
    logger.debug(`Stock check error for ${url.slice(0, 60)}: ${error.message}`);
    return { inStock: true, reason: 'error_assumed_ok' };
  }
}

/**
 * Batch check stock for multiple deals.
 * Mutates deals in-place: adds deal.inStock and deal.stockReason.
 * Returns array of in-stock deals.
 * @param {Array} deals
 * @param {number} concurrency
 * @returns {Promise<Array>} Only in-stock deals
 */
async function batchCheckStock(deals, concurrency = 3) {
  logger.info(`Checking stock for ${deals.length} deals (concurrency: ${concurrency})`);
  let inStockCount = 0;
  let oosCount = 0;
  let skippedSearchUrls = 0;

  const chunks = [];
  for (let i = 0; i < deals.length; i += concurrency) {
    chunks.push(deals.slice(i, i + concurrency));
  }

  const results = [];
  for (const chunk of chunks) {
    const chunkResults = await Promise.all(chunk.map(async deal => {
      // Search URLs are always valid — skip stock check for them
      // (checking stock on a search results page makes no sense)
      if (deal._isSearchUrl === true) {
        deal.inStock = true;
        deal.stockReason = 'search_url_exempt';
        inStockCount++;
        skippedSearchUrls++;
        return deal;
      }

      const url = deal.affiliateLink || deal.productUrl;
      if (!url) return null;

      const { inStock, reason } = await checkStock(url);
      deal.inStock = inStock;
      deal.stockReason = reason;

      if (inStock) {
        inStockCount++;
        return deal;
      } else {
        oosCount++;
        logger.info(`OOS (${reason}): ${deal.title.slice(0, 60)}`);
        return null;
      }
    }));

    results.push(...chunkResults.filter(Boolean));
  }

  logger.info(`Stock check: ${inStockCount} in stock, ${oosCount} OOS, ${skippedSearchUrls} search-URL deals (exempt)`);
  return results;
}

function _getStorePatterns(hostname) {
  for (const [domain, patterns] of Object.entries(STORE_OOS_PATTERNS)) {
    if (hostname.includes(domain)) return patterns;
  }
  return [];
}

function _getHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function _cacheResult(url, inStock, reason) {
  stockCache.set(url, { inStock, reason, checkedAt: Date.now() });
}

module.exports = { checkStock, batchCheckStock };
