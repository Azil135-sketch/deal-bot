/**
 * Affiliate Router v4 - Realistic Multi-Network Support
 *
 * Routes product URLs through the best available affiliate network.
 *
 * Priority:
 *   1. Cuelinks API (auto-approved campaigns only — Myntra, Nykaa, Ajio, etc.)
 *   2. Direct store affiliate programs (Amazon Associates, Flipkart Affiliate)
 *   3. UTM tracking fallback (always works, click tracking only)
 *
 * WHAT WORKS NOW:
 *   - Cuelinks: Auto-approved stores get real affiliate links instantly
 *   - Amazon/Flipkart: Direct Associates/Affiliate IDs if you have accounts
 *   - UTM fallback: Works for all stores, tracks clicks, no commission
 *
 * WHAT DOES NOT EXIST:
 *   - EarnKaro has NO public API for automated link generation.
 *     You create links manually via their dashboard/extension.
 */

const axios = require('axios');
const CuelinksAPI = require('./cuelinksAPI');
const logger = require('./logger');

const URL_RESOLVE_TIMEOUT = 10000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// Auto-approved campaigns on Cuelinks (no manual approval needed)
const AUTO_APPROVED_STORES = [
  'myntra.com', 'ajio.com', 'nykaa.com', 'nykaa.in',
  'tatacliq.com', 'croma.com', 'reliancedigital.in',
  'meesho.com', 'snapdeal.com', 'shopsy.in',
  'bewakoof.com', 'clovia.com', 'pantaloons.com',
  'urbanic.com', 'libas.in', 'westside.com', 'fabindia.com',
  'firstcry.com', 'hopscotch.in', 'zivame.com',
  'boat-lifestyle.com', 'gonoise.com',
  'healthkart.com', 'netmeds.com', 'pharmeasy.in',
  'tata1mg.com', '1mg.com', 'lenskart.com',
  'pepperfry.com', 'hometown.in'
];

// Stores that REQUIRE manual approval on Cuelinks
const MANUAL_APPROVAL_STORES = [
  'amazon.in', 'flipkart.com'
];

function isAutoApprovedStore(hostname) {
  const h = (hostname || '').toLowerCase().replace('www.', '');
  return AUTO_APPROVED_STORES.some(d => h.includes(d));
}

function isManualApprovalStore(hostname) {
  const h = (hostname || '').toLowerCase().replace('www.', '');
  return MANUAL_APPROVAL_STORES.some(d => h.includes(d));
}

class AffiliateRouter {
  constructor() {
    this.cuelinks = new CuelinksAPI();
    this._resolvedUrlCache = new Map();
  }

  /**
   * Convert a product URL to an affiliate link.
   */
  async getAffiliateLink(url, subId = 'deal-bot', needsResolution = false) {
    if (!url) return { link: url, method: 'passthrough', resolvedUrl: url };

    let normalized = this._normalizeUrl(url);
    let hostname = '';
    try { hostname = new URL(normalized).hostname.toLowerCase(); } catch {}

    // Step 1: Resolve redirect URL to actual product page if needed
    if (needsResolution || !this._isDirectProductUrl(normalized)) {
      const resolved = await this._resolveRedirectUrl(normalized);
      if (resolved) {
        normalized = resolved;
        try { hostname = new URL(normalized).hostname.toLowerCase(); } catch {}
      }
    }

    // Step 2: Validate URL
    const isValid = await this._isUrlValid(normalized);
    if (!isValid) {
      logger.warn(`Skipping invalid URL: ${normalized.slice(0, 80)}`);
      return { link: null, method: 'invalid', resolvedUrl: normalized };
    }

    // Step 3: Route to best affiliate network

    // 3a: Cuelinks for auto-approved stores (instant commission)
    if (isAutoApprovedStore(hostname)) {
      try {
        const result = await this.cuelinks.generateLink(normalized, subId);
        if (result && result.length > 10) {
          return { link: result, method: 'cuelinks', resolvedUrl: normalized };
        }
      } catch (err) {
        logger.debug('Cuelinks failed, trying fallback', { error: err.message });
      }
    }

    // 3b: Direct affiliate programs for Amazon/Flipkart
    if (isManualApprovalStore(hostname)) {
      const directLink = this._buildDirectAffiliateLink(normalized, subId, hostname);
      if (directLink !== normalized) {
        return { link: directLink, method: 'direct-affiliate', resolvedUrl: normalized };
      }
    }

    // Step 4: UTM tracking fallback (works for all stores)
    const fallback = this._buildUTMFallback(normalized, subId);
    return {
      link: fallback,
      method: fallback !== normalized ? 'utm-fallback' : 'passthrough',
      resolvedUrl: normalized
    };
  }

  /**
   * Build direct affiliate links for stores with public programs.
   * Requires you to have an account with the program.
   */
  _buildDirectAffiliateLink(url, subId, hostname) {
    try {
      const parsed = new URL(url);

      if (hostname.includes('amazon.in')) {
        const tag = process.env.AMAZON_ASSOCIATES_TAG;
        if (tag) {
          parsed.searchParams.set('tag', tag);
          parsed.searchParams.set('ref', `dealbot_${subId}`);
        }
        return parsed.toString();
      }

      if (hostname.includes('flipkart.com')) {
        const affId = process.env.FLIPKART_AFFILIATE_ID;
        if (affId) {
          parsed.searchParams.set('affid', affId);
          parsed.searchParams.set('utm_source', 'dealbot');
          parsed.searchParams.set('utm_campaign', subId);
        }
        return parsed.toString();
      }

      return url;
    } catch {
      return url;
    }
  }

  /**
   * Build UTM fallback links (always works, tracks clicks).
   * No commission, but you see what's converting.
   */
  _buildUTMFallback(url, subId) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      parsed.searchParams.set('utm_source', 'dealbot');
      parsed.searchParams.set('utm_medium', 'affiliate');
      parsed.searchParams.set('utm_campaign', subId);

      if (hostname.includes('myntra.com')) {
        parsed.searchParams.set('ref', `db_${subId}`);
      }

      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Follow HTTP redirects to get the final product URL.
   * Uses GET-with-stream to capture final URL, then destroys stream.
   * Handles axios v1.x redirect quirks across Node versions.
   */
  async _resolveRedirectUrl(url) {
    if (this._resolvedUrlCache.has(url)) return this._resolvedUrlCache.get(url);

    try {
      const resp = await axios.get(url, {
        timeout: URL_RESOLVE_TIMEOUT,
        maxRedirects: 10,
        headers: {
          'User-Agent': REDIRECT_FOLLOW_UA,
          'Accept': 'text/html,application/xhtml+xml'
        },
        responseType: 'stream',
        validateStatus: s => s < 500
      });

      // Destroy stream immediately — we only care about the final URL
      resp.data.destroy();

      // Extract final URL: check multiple axios properties for compatibility
      let finalUrl =
        resp.request?.res?.responseUrl ||
        resp.request?.responseURL ||
        resp.config?.url ||
        url;

      // If we got a relative URL, resolve it against original
      if (finalUrl && !finalUrl.startsWith('http')) {
        try { finalUrl = new URL(finalUrl, url).href; } catch { finalUrl = url; }
      }

      this._resolvedUrlCache.set(url, finalUrl);
      return finalUrl;
    } catch {
      // Fallback: try HEAD request
      try {
        const resp = await axios.head(url, {
          timeout: URL_RESOLVE_TIMEOUT,
          maxRedirects: 10,
          headers: {
            'User-Agent': REDIRECT_FOLLOW_UA,
            'Accept': 'text/html'
          },
          validateStatus: s => s < 500
        });

        let finalUrl =
          resp.request?.res?.responseUrl ||
          resp.request?.responseURL ||
          resp.config?.url ||
          url;

        if (finalUrl && !finalUrl.startsWith('http')) {
          try { finalUrl = new URL(finalUrl, url).href; } catch { finalUrl = url; }
        }

        this._resolvedUrlCache.set(url, finalUrl);
        return finalUrl;
      } catch {
        this._resolvedUrlCache.set(url, url);
        return url;
      }
    }
  }

  /**
   * Validate that a URL returns a valid response.
   */
  async _isUrlValid(url) {
    if (!url) return false;
    try {
      const resp = await axios.head(url, {
        timeout: URL_RESOLVE_TIMEOUT,
        maxRedirects: 5,
        headers: { 'User-Agent': USER_AGENT },
        validateStatus: s => s < 500
      });
      return resp.status < 400;
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') return false;
      return true;
    }
  }

  _isDirectProductUrl(url) {
    try {
      const u = new URL(url);
      return /\/p\/|\/product\/|\/buy\/|\/dp\/|\/itm\/|[?&]pid=/.test(u.pathname + u.search);
    } catch {
      return false;
    }
  }

  _normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.protocol = 'https:';
      const STRIP = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
      STRIP.forEach(k => parsed.searchParams.delete(k));
      return parsed.toString();
    } catch {
      return url;
    }
  }
}

module.exports = AffiliateRouter;
