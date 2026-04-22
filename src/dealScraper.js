/**
 * Deal Scraper Module v4 - Real Product URL Resolution
 *
 * PRIMARY SOURCES:
 *   1. DealsMagnet RSS (https://www.dealsmagnet.com/feed/) - Live RSS feed
 *   2. Desidime HTML (https://www.desidime.com/deals) - HTML scraping with URL resolution
 *   3. GrabOn RSS (https://www.grabon.in/rss/) - RSS feed
 *
 * URL STRATEGY - THE FIX:
 *   Instead of building search URLs (which redirect to search queries),
 *   we now FOLLOW the deal links to extract ACTUAL product URLs.
 *
 *   Process: RSS/HTML gives us deal aggregator links → Follow redirects
 *   → Extract real product URL from final destination → Affiliate link
 *
 *   This ensures users land on ACTUAL PRODUCT PAGES, not search results.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('./logger');

const TIMEOUT = 20000;
const URL_RESOLVE_TIMEOUT = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const REDIRECT_FOLLOW_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// Cuelinks-affiliated stores
const CUELINKS_STORES = new Set([
  'myntra', 'ajio', 'nykaa', 'nykaa.in', 'tatacliq', 'tata cliq',
  'meesho', 'croma', 'reliancedigital', 'reliance digital', 'snapdeal',
  'bewakoof', 'clovia', 'lifestyle', 'pantaloons', 'urbanic',
  'libas', 'westside', 'fabindia', 'firstcry', 'hopscotch',
  'zivame', 'healthkart', 'netmeds', 'pharmeasy', 'tata1mg', '1mg',
  'lenskart', 'fastrack', 'titan', 'pepperfry', 'hometown'
]);

// Map store names to their search URL builders (fallback only)
const SEARCH_URL_MAP = {
  'myntra': (k) => `https://www.myntra.com/${slug(k)}?rf=Price%3A${low(k)}%3A${high(k)}_APPLIED`,
  'ajio': (k) => `https://www.ajio.com/search/?text=${enc(k)}&rtf=0|Price:${low(k)}-${high(k)}`,
  'nykaa': (k) => `https://www.nykaa.com/search/result/?q=${enc(k)}&root=search&searchType=product` 
};

function enc(s) { return encodeURIComponent(s || ''); }
function slug(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
function low(s) { return Math.floor(((s || '').match(/\d+/) || [0])[0] * 0.7) || 100; }
function high(s) { return Math.ceil(((s || '').match(/\d+/) || [9999])[0] * 1.3) || 9999; }

function extractSearchKeywords(title) {
  const noise = /\b(buy|online|india|offers?|deals?|off|discount|sale|get|grab|free|shipping|cod|emi|with|and|or|for|the|a|an|in|at|of|to|rs|inr|pack|combo|set)\b/gi;
  return (title || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[₹\d,]+(\s*%?\s*(?:off|discount))?/g, '')
    .replace(noise, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 6)
    .join(' ');
}

function parseStoreFromCategory(categories) {
  for (const cat of (categories || [])) {
    const c = cat.toLowerCase();
    if (c.includes('myntra')) return 'myntra';
    if (c.includes('amazon')) return 'amazon';
    if (c.includes('flipkart')) return 'flipkart';
    if (c.includes('nykaa')) return 'nykaa';
    if (c.includes('ajio')) return 'ajio';
    if (c.includes('tatacliq') || c.includes('tata cliq')) return 'tatacliq';
    if (c.includes('meesho')) return 'meesho';
    if (c.includes('croma')) return 'croma';
    if (c.includes('snapdeal')) return 'snapdeal';
    if (c.includes('healthkart')) return 'healthkart';
    if (c.includes('netmeds')) return 'netmeds';
    if (c.includes('pharmeasy')) return 'pharmeasy';
    if (c.includes('1mg')) return '1mg';
    if (c.includes('pepperfry')) return 'pepperfry';
    if (c.includes('firstcry')) return 'firstcry';
    if (c.includes('bewakoof')) return 'bewakoof';
    if (c.includes('lenskart')) return 'lenskart';
  }
  return null;
}

function parseStoreFromDescription(desc) {
  const match = (desc || '').match(/offer store:\s*([a-z0-9\s.]+)/i);
  return match ? match[1].trim().toLowerCase() : null;
}

function parsePricesFromDescription(desc) {
  const discountMatch = desc.match(/(\d+)%\s*off/i);
  const offerPriceMatch = desc.match(/offer price of\s*₹\s*([\d,]+)/i);
  const mrpMatch = desc.match(/MRP:\s*₹\s*([\d,]+)/i);

  return {
    discountPct: discountMatch ? parseInt(discountMatch[1]) : 0,
    discountedPrice: offerPriceMatch ? parseInt(offerPriceMatch[1].replace(/,/g, '')) : 0,
    originalPrice: mrpMatch ? parseInt(mrpMatch[1].replace(/,/g, '')) : 0
  };
}

function isAffiliatableStore(storeName) {
  if (!storeName) return false;
  const s = storeName.toLowerCase();
  for (const cStore of CUELINKS_STORES) {
    if (s.includes(cStore) || cStore.includes(s)) return true;
  }
  return false;
}

function dealId(title, store) {
  const raw = `${(store || '')}:${(title || '').slice(0, 80)}`;
  return `dm-${Buffer.from(raw).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`;
}

// ─── REAL PRODUCT URL RESOLVER ───────────────────────────────────────────────
/**
 * Follow a deal link through all redirects to find the REAL product URL.
 * This is the core fix — instead of search URLs, we extract actual product pages.
 */
async function resolveRealProductUrl(dealLink, storeHint) {
  if (!dealLink) return null;

  try {
    // Some RSS feeds contain the actual product URL directly
    if (isDirectProductUrl(dealLink)) {
      logger.debug(`Direct product URL found: ${dealLink.slice(0, 60)}`);
      return dealLink;
    }

    // Follow redirects to find the real product URL
    const resp = await axios.head(dealLink, {
      timeout: URL_RESOLVE_TIMEOUT,
      maxRedirects: 10,
      headers: {
        'User-Agent': REDIRECT_FOLLOW_UA,
        'Accept': 'text/html'
      },
      validateStatus: s => s < 500
    });

    const finalUrl = resp.request?.res?.responseUrl || resp.config?.url || dealLink;

    if (isDirectProductUrl(finalUrl)) {
      logger.debug(`Resolved to product URL: ${finalUrl.slice(0, 60)}`);
      return cleanProductUrl(finalUrl, storeHint);
    }

    // If still not a product URL, try GET request to parse page
    return await extractProductFromPage(finalUrl, storeHint);

  } catch (error) {
    // HEAD failed, try GET with early abort
    try {
      const resp = await axios.get(dealLink, {
        timeout: URL_RESOLVE_TIMEOUT,
        maxRedirects: 10,
        headers: {
          'User-Agent': REDIRECT_FOLLOW_UA,
          'Accept': 'text/html'
        },
        responseType: 'stream',
        validateStatus: s => s < 500
      });

      resp.data.destroy(); // We only need the URL
      const finalUrl = resp.request?.res?.responseUrl || resp.config?.url || dealLink;

      if (isDirectProductUrl(finalUrl)) {
        return cleanProductUrl(finalUrl, storeHint);
      }
      return await extractProductFromPage(finalUrl, storeHint);

    } catch (e2) {
      logger.debug(`URL resolution failed for ${dealLink.slice(0, 60)}: ${e2.message}`);
      return null;
    }
  }
}

function isDirectProductUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    // Must be a known commerce domain
    const commerceDomains = [
      'myntra.com', 'ajio.com', 'nykaa.com', 'nykaa.in', 'tatacliq.com',
      'croma.com', 'reliancedigital.in', 'meesho.com', 'snapdeal.com',
      'bewakoof.com', 'clovia.com', 'pantaloons.com', 'lifestylestores.com',
      'urbanic.com', 'libas.in', 'westside.com', 'fabindia.com',
      'firstcry.com', 'hopscotch.in', 'zivame.com',
      'healthkart.com', 'netmeds.com', 'pharmeasy.in', 'tata1mg.com', '1mg.com',
      'lenskart.com', 'fastrack.com', 'titan.co.in',
      'pepperfry.com', 'hometown.in'
    ];

    const isCommerce = commerceDomains.some(d => host.includes(d));
    if (!isCommerce) return false;

    // Must look like a product URL (not search, not category)
    const isSearch = path.includes('/search') || path.includes('/s?') ||
                     path.includes('/q=') || path.includes('/query=') ||
                     path.includes('/catalogsearch/result');
    if (isSearch) return false;

    // Must have a product identifier in path
    const hasProductId = /\/p\/|\/product\/|\/buy\/|\/dp\/|\/itm\/|\/item\/|\/[\w-]+\d{6,}|[?&]pid=/.test(path + u.search);
    if (!hasProductId) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract product URL from a deal aggregator page by parsing the "Go to Store" link.
 */
async function extractProductFromPage(aggregatorUrl, storeHint) {
  try {
    const resp = await axios.get(aggregatorUrl, {
      timeout: URL_RESOLVE_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html'
      },
      maxContentLength: 200 * 1024,
      validateStatus: s => s < 500
    });

    const html = resp.data || '';

    // Common patterns for "Go to Store" / affiliate links
    const linkPatterns = [
      // Desidime: data-href or href on buy button
      /data-href=["'](https?:\/\/[^"']+)["']/i,
      // Generic: "Go to Store" links
      /href=["'](https?:\/\/[^"']+(?:myntra|ajio|nykaa|tatacliq|croma|meesho|snapdeal|bewakoof)[^"']*)["']/i,
      // Rel="nofollow" affiliate links
      /<a[^>]*rel=["'][^"]*nofollow[^"]*["'][^>]*href=["'](https?:\/\/[^"']+)["']/i,
      // onclick tracking links
      /onclick=["'][^"]*(?:window\.location\.href|open)\s*=\s*["'](https?:\/\/[^"']+)["']/i,
    ];

    for (const pattern of linkPatterns) {
      const match = html.match(pattern);
      if (match) {
        const foundUrl = match[1];
        if (isDirectProductUrl(foundUrl)) {
          return cleanProductUrl(foundUrl, storeHint);
        }
        // If it looks like a redirect URL, follow it
        if (foundUrl.includes('track.') || foundUrl.includes('/go/') || foundUrl.includes('/out/')) {
          return await resolveRealProductUrl(foundUrl, storeHint);
        }
      }
    }

    return null;
  } catch (error) {
    logger.debug(`Extract from page failed for ${aggregatorUrl.slice(0, 60)}: ${error.message}`);
    return null;
  }
}

/**
 * Clean a product URL - remove tracking params, ensure HTTPS.
 */
function cleanProductUrl(url, storeHint) {
  try {
    const parsed = new URL(url);
    parsed.protocol = 'https:';

    // Strip common tracking parameters
    const STRIP = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                   'fbclid', 'gclid', 'ref', 'referrer', 'timestamp', 'cb'];
    STRIP.forEach(k => parsed.searchParams.delete(k));

    return parsed.toString();
  } catch {
    return url;
  }
}

// ─── DEAL SCRAPER CLASS ──────────────────────────────────────────────────────
class DealScraper {
  constructor() {
    this.client = axios.create({
      timeout: TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xml,application/xhtml+xml,*/*',
        'Accept-Language': 'en-IN,en;q=0.9'
      }
    });
    // Cache for resolved URLs to avoid duplicate resolution
    this.urlCache = new Map();
  }

  async scrapeAll() {
    const results = await Promise.allSettled([
      this.scrapeDealsMagnetRss(),
      this.scrapeDesidimeHtml(),
      this.scrapeGrabOnRss()
    ]);

    const deals = [];
    const sources = ['dealsmagnet_rss', 'desidime_html', 'grabon_rss'];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        logger.info(`${sources[i]}: ${result.value.length} deals`);
        deals.push(...result.value);
      } else {
        logger.warn(`${sources[i]} error`, { error: result.reason?.message });
      }
    });

    logger.info(`Total raw scraped: ${deals.length} deals`);
    return deals;
  }

  /**
   * PRIMARY: DealsMagnet RSS feed with REAL URL resolution.
   */
  async scrapeDealsMagnetRss() {
    try {
      const resp = await this.client.get('https://www.dealsmagnet.com/feed/', {
        headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' }
      });

      const $ = cheerio.load(resp.data, { xmlMode: true });
      const deals = [];
      const seen = new Set();
      const MIN_DISCOUNT = parseInt(process.env.MIN_DISCOUNT_PERCENT || '20');
      const MIN_SAVINGS = parseInt(process.env.MIN_SAVINGS_AMOUNT || '100');

      const items = $('item').toArray();
      logger.info(`DealsMagnet RSS: ${items.length} items found`);

      for (const el of items) {
        if (deals.length >= 20) break;
        try {
          const $el = $(el);
          const title = $el.find('title').first().text().trim();
          const desc = $el.find('description').first().text().trim();
          const link = $el.find('link').first().text().trim();
          const guid = $el.find('guid').first().text().trim();

          const categories = [];
          $el.find('category').each((_, cat) => categories.push($(cat).text().trim()));

          if (!title || title.length < 5) continue;
          if (seen.has(title)) continue;
          seen.add(title);

          // Parse price data
          const { discountPct, discountedPrice, originalPrice } = parsePricesFromDescription(desc);

          // Quality gates
          if (discountPct < MIN_DISCOUNT) continue;
          if (discountedPrice > 0 && originalPrice > 0 && (originalPrice - discountedPrice) < MIN_SAVINGS) continue;

          // Skip non-product deals
          const titleLower = title.toLowerCase();
          if (/cashback|quiz|answer|lottery|recharge|\\btop-?up\\b|free\\s+recharge|\\bbank\\b|freebie|referral|flash sale promo|gold coin|gold bar|silver coin/i.test(title)) continue;

          // Determine store
          const storeName = parseStoreFromCategory(categories) || parseStoreFromDescription(desc);
          if (!storeName) continue;
          if (!isAffiliatableStore(storeName)) continue;

          // ─── THE FIX: Resolve REAL product URL ────────────────────
          const dealLink = link || guid;
          let productUrl = null;
          let urlSource = 'resolved';

          if (dealLink) {
            // Check cache first
            const cacheKey = `${storeName}:${title.slice(0, 40)}`;
            if (this.urlCache.has(cacheKey)) {
              productUrl = this.urlCache.get(cacheKey);
              urlSource = 'cache';
            } else {
              // Try to resolve real product URL
              productUrl = await resolveRealProductUrl(dealLink, storeName);
              if (productUrl) {
                this.urlCache.set(cacheKey, productUrl);
              }
            }
          }

          // Fallback: build search URL only if we couldn't resolve
          if (!productUrl) {
            const keywords = extractSearchKeywords(title);
            if (SEARCH_URL_MAP[storeName]) {
              productUrl = SEARCH_URL_MAP[storeName](keywords);
              urlSource = 'search_fallback';
            } else {
              continue; // Skip if we can't get any URL
            }
          }

          // Extract image from RSS
          const imageMatch = desc.match(/https?:\/\/[^"'\s<>]*(?:dealsmagnet|cdn)[^"'\s<>]*\.(?:jpg|jpeg|png|webp)/i);
          const imageUrl = imageMatch ? imageMatch[0] : null;

          const id = dealId(title, storeName);

          deals.push({
            id,
            source: storeName,
            title: title.slice(0, 200),
            originalPrice: originalPrice || (discountedPrice > 0 ? Math.round(discountedPrice / (1 - (discountPct || 30) / 100)) : 999),
            discountedPrice: discountedPrice || 0,
            discount: discountPct || 30,
            rating: null,
            reviews: null,
            trendScore: this._trendScore(discountPct, discountedPrice, storeName),
            productUrl,
            imageUrl,
            description: desc.replace(/<[^>]*>/g, '').slice(0, 300),
            timestamp: new Date().toISOString(),
            _scraperSource: 'dealsmagnet_rss',
            _storeRaw: storeName,
            _isSearchUrl: urlSource === 'search_fallback',
            _urlSource: urlSource,
            _needsUrlResolution: false
          });
        } catch (e) {
          logger.debug(`RSS item parse error: ${e.message}`);
        }
      }

      logger.info(`DealsMagnet RSS: ${deals.length} deals with real URLs`);
      return deals;
    } catch (error) {
      logger.warn('DealsMagnet RSS error', { error: error.message });
      return [];
    }
  }

  /**
   * SECONDARY: Desidime HTML scraper with real URL extraction.
   */
  async scrapeDesidimeHtml() {
    try {
      const resp = await this.client.get('https://www.desidime.com/deals', {
        headers: { 'Referer': 'https://www.desidime.com/' }
      });

      const $ = cheerio.load(resp.data);
      const deals = [];
      const seen = new Set();

      // Find deal cards
      const dealCards = $('a[href*="/deals/"]').toArray();
      logger.info(`Desidime HTML: ${dealCards.length} deal cards found`);

      for (const el of dealCards.slice(0, 15)) {
        try {
          const $el = $(el);
          const title = $el.attr('title') || $el.text().trim();
          const href = $el.attr('href');

          if (!title || title.length < 10 || seen.has(title)) continue;
          if (!href || href.includes('#')) continue;

          // Skip non-product deals
          if (/quiz|answer|bank offer|cashback|recharge|freebie|lottery/i.test(title)) continue;
          seen.add(title);

          const parentText = $el.closest('div, article, li').text();
          const prices = (parentText.match(/₹\s*(\d[\d,]*)/g) || [])
            .map(p => parseInt(p.replace(/[^\d]/g, '')))
            .filter(p => p > 0 && p < 500000)
            .sort((a, b) => a - b);

          const discountedPrice = prices[0] || 0;
          const originalPrice = prices[prices.length - 1] || 0;
          const discountMatch = parentText.match(/(\d+)%\s*off/i);
          const discountPct = discountMatch
            ? parseInt(discountMatch[1])
            : (originalPrice > discountedPrice && discountedPrice > 0
              ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)
              : 0);

          if (discountPct < 20) continue;
          if (discountedPrice > 0 && (originalPrice - discountedPrice) < 100) continue;

          const storeName = this._extractStoreFromTitle(title) || this._extractStoreFromUrl(href);
          if (!storeName || !isAffiliatableStore(storeName)) continue;

          // Resolve real URL from the deal page
          const dealPageUrl = href.startsWith('http') ? href : `https://www.desidime.com${href}`;
          let productUrl = await resolveRealProductUrl(dealPageUrl, storeName);
          let isSearchUrl = false;

          if (!productUrl) {
            // Fallback to search URL
            const keywords = extractSearchKeywords(title);
            if (SEARCH_URL_MAP[storeName]) {
              productUrl = SEARCH_URL_MAP[storeName](keywords);
              isSearchUrl = true;
            } else {
              continue;
            }
          }

          const imgEl = $el.closest('div, article, li').find('img').first();
          const imageUrl = imgEl.attr('data-src') || imgEl.attr('src') || null;

          deals.push({
            id: `ddd-${Buffer.from(title).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`,
            source: storeName,
            title: title.slice(0, 200),
            originalPrice: originalPrice || (discountedPrice ? Math.round(discountedPrice * 1.5) : 999),
            discountedPrice: discountedPrice || 499,
            discount: discountPct || 25,
            rating: null,
            reviews: null,
            trendScore: 5,
            productUrl,
            imageUrl: imageUrl?.startsWith('http') ? imageUrl : null,
            description: title,
            timestamp: new Date().toISOString(),
            _scraperSource: 'desidime_html',
            _storeRaw: storeName,
            _isSearchUrl: isSearchUrl,
            _urlSource: isSearchUrl ? 'search_fallback' : 'resolved',
            _needsUrlResolution: false
          });
        } catch (e) {}
      }

      return deals;
    } catch (error) {
      logger.warn('Desidime HTML error', { error: error.message });
      return [];
    }
  }

  /**
   * TERTIARY: GrabOn RSS feed.
   */
  async scrapeGrabOnRss() {
    try {
      const resp = await this.client.get('https://www.grabon.in/rss/', {
        headers: { 'Accept': 'application/rss+xml,application/xml,*/*' },
        timeout: 15000
      });

      const $ = cheerio.load(resp.data, { xmlMode: true });
      const deals = [];
      const seen = new Set();

      $('item').each((i, el) => {
        if (deals.length >= 10) return false;
        try {
          const $el = $(el);
          const title = $el.find('title').first().text().trim();
          const link = $el.find('link').first().text().trim();
          const desc = $el.find('description').first().text().trim();

          if (!title || seen.has(title)) return;
          seen.add(title);

          // Extract store from title
          const storeMatch = title.match(/(Myntra|Nykaa|Ajio|Amazon|Flipkart|TataCliq|Meesho|Croma|Snapdeal|Bewakoof|Healthkart|Netmeds|PharmEasy|1mg)/i);
          const storeName = storeMatch ? storeMatch[1].toLowerCase() : null;
          if (!storeName || !isAffiliatableStore(storeName)) return;

          // Extract discount
          const discountMatch = title.match(/(\d+)%\s*(?:Off|OFF|off)/);
          const discountPct = discountMatch ? parseInt(discountMatch[1]) : 0;
          if (discountPct < 20) return;

          // Try to resolve real URL
          let productUrl = null;
          // GrabOn links usually redirect to actual product pages
          if (link) {
            productUrl = link; // Will be resolved by affiliateRouter
          }

          if (!productUrl) return;

          deals.push({
            id: `go-${Buffer.from(title).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`,
            source: storeName,
            title: title.slice(0, 200),
            originalPrice: 0,
            discountedPrice: 0,
            discount: discountPct,
            rating: null,
            reviews: null,
            trendScore: this._trendScore(discountPct, 0, storeName),
            productUrl,
            imageUrl: null,
            description: desc.replace(/<[^>]*>/g, '').slice(0, 300),
            timestamp: new Date().toISOString(),
            _scraperSource: 'grabon_rss',
            _storeRaw: storeName,
            _isSearchUrl: false,
            _urlSource: 'aggregator_redirect',
            _needsUrlResolution: true
          });
        } catch (e) {}
      });

      return deals;
    } catch (error) {
      logger.warn('GrabOn RSS error', { error: error.message });
      return [];
    }
  }

  _trendScore(discountPct, discountedPrice, store) {
    let score = 5;
    if (discountPct >= 70) score += 3;
    else if (discountPct >= 50) score += 2;
    else if (discountPct >= 30) score += 1;
    if (discountedPrice > 0 && discountedPrice < 500) score += 1;
    if (['myntra', 'nykaa', 'ajio', 'healthkart'].includes(store)) score += 1;
    return Math.min(score, 10);
  }

  _extractStoreFromTitle(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('myntra')) return 'myntra';
    if (t.includes('ajio')) return 'ajio';
    if (t.includes('nykaa')) return 'nykaa';
    if (t.includes('amazon')) return 'amazon';
    if (t.includes('flipkart')) return 'flipkart';
    if (t.includes('tatacliq') || t.includes('tata cliq')) return 'tatacliq';
    if (t.includes('meesho')) return 'meesho';
    if (t.includes('croma')) return 'croma';
    if (t.includes('healthkart')) return 'healthkart';
    if (t.includes('netmeds')) return 'netmeds';
    if (t.includes('1mg')) return '1mg';
    if (t.includes('pharmeasy')) return 'pharmeasy';
    if (t.includes('snapdeal')) return 'snapdeal';
    return null;
  }

  _extractStoreFromUrl(url) {
    try {
      const h = new URL(url.startsWith('http') ? url : `https://desidime.com${url}`).hostname;
      for (const key of Object.keys(SEARCH_URL_MAP)) {
        if (h.includes(key)) return key;
      }
    } catch {}
    return null;
  }
}

module.exports = DealScraper;
