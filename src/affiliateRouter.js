/**
 * Affiliate Router Module
 * Routes each product URL to the best available affiliate network.
 *
 * Priority:
 * 1. Cuelinks (if API key present and campaign active) — supports Amazon, Flipkart, Myntra, Ajio, Nykaa, Meesho, etc.
 * 2. Direct partner links using store-specific tracking params (fallback, free)
 * 3. Raw URL passthrough (last resort)
 *
 * Cuelinks approval notes:
 * - Amazon & Flipkart sometimes require higher traffic approval. Other brands typically approve instantly.
 * - We try all URL through Cuelinks first, then fall back gracefully.
 */

const axios = require('axios');
const logger = require('./logger');

const CUELINKS_API_BASE = 'https://api.cuelinks.com/v2';

class AffiliateRouter {
  constructor() {
    this.apiKey = process.env.CUELINKS_API_KEY;
    this.channelId = process.env.CUELINKS_CHANNEL_ID || '';
    this.publisherId = process.env.CUELINKS_PUBLISHER_ID || '';

    this.client = this.apiKey ? axios.create({
      baseURL: CUELINKS_API_BASE,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }) : null;

    this._campaignCache = null;
    this._campaignCacheTime = 0;
    this.CAMPAIGN_CACHE_TTL = 3600 * 1000;
  }

  /**
   * Convert a product URL to an affiliate link.
   * @param {string} url
   * @param {string} subId
   * @returns {Promise<{ link: string, method: string }>}
   */
  async getAffiliateLink(url, subId = 'deal-bot') {
    if (!url) return { link: url, method: 'passthrough' };

    const normalized = this._normalizeUrl(url);

    if (this.client && this.apiKey) {
      try {
        const result = await this._cuelinksLink(normalized, subId);
        if (result && result.includes('cuelinks.com')) {
          return { link: result, method: 'cuelinks' };
        }
      } catch (err) {
        logger.warn('Cuelinks link generation failed, trying fallback', { url: normalized, error: err.message });
      }
    }

    const fallback = this._buildFallbackLink(normalized, subId);
    return { link: fallback, method: fallback !== normalized ? 'direct-param' : 'passthrough' };
  }

  /**
   * Fetch all active campaigns from Cuelinks.
   * Results are cached for 1 hour.
   * @returns {Promise<Array>}
   */
  async getActiveCampaigns() {
    if (Date.now() - this._campaignCacheTime < this.CAMPAIGN_CACHE_TTL && this._campaignCache) {
      return this._campaignCache;
    }

    if (!this.client) {
      logger.warn('No Cuelinks API key; cannot fetch campaigns');
      return [];
    }

    try {
      const resp = await this.client.get('/campaigns.json');
      const data = resp.data?.data || resp.data || [];
      const campaigns = Array.isArray(data) ? data : [];

      this._campaignCache = campaigns;
      this._campaignCacheTime = Date.now();

      logger.info(`Cuelinks: ${campaigns.length} active campaigns fetched`);
      return campaigns;
    } catch (error) {
      logger.warn('Failed to fetch Cuelinks campaigns', { error: error.message });
      return [];
    }
  }

  /**
   * Filter campaigns that DON'T require approval or are for stores
   * less likely to block new publishers.
   */
  async getOpenCampaigns() {
    const all = await this.getActiveCampaigns();

    const HIGH_APPROVAL_BRANDS = [
      'myntra', 'ajio', 'nykaa', 'tatacliq', 'croma',
      'meesho', 'snapdeal', 'reliancedigital', 'shopsy',
      'bewakoof', 'clovia', 'pantaloons', 'lifestyle',
      'urbanic', 'libas', 'westside', 'fabindia',
      'firstcry', 'hopscotch', 'mothercare',
      'zivame', 'prettysecrets',
      'boat', 'noise', 'crossbeats', 'boult',
      'wow', 'mamaearth', 'mcaffeine', 'plum', 'minimalist',
      'healthkart', 'netmeds', 'pharmeasy', 'tata1mg',
      'zoomcar', 'drivezy',
      'lenskart', 'fastrack', 'titan',
      'pepperfry', 'hometown', 'ikea'
    ];

    return all.filter(c => {
      const name = (c.name || c.advertiser_name || '').toLowerCase();
      return HIGH_APPROVAL_BRANDS.some(b => name.includes(b));
    });
  }

  /**
   * Generate a Cuelinks short link via the API
   * @private
   */
  async _cuelinksLink(url, subId) {
    const payload = { source_url: url, subid: subId };
    if (this.channelId) payload.channel_id = this.channelId;

    const resp = await this.client.post('/links.json', payload);
    const data = resp.data?.data || resp.data;

    if (resp.data?.success === false) {
      throw new Error(resp.data?.message || 'API returned success=false');
    }

    return data?.link || data?.short_url || null;
  }

  /**
   * Build a direct affiliate link using known store tracking parameters.
   * These are publicly documented affiliate tracking parameters.
   * @private
   */
  _buildFallbackLink(url, subId) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      if (hostname.includes('myntra.com')) {
        parsed.searchParams.set('ref', `dealbot_${subId}`);
        return parsed.toString();
      }

      if (hostname.includes('ajio.com')) {
        parsed.searchParams.set('utm_source', 'dealbot');
        parsed.searchParams.set('utm_medium', 'affiliate');
        parsed.searchParams.set('utm_campaign', subId);
        return parsed.toString();
      }

      if (hostname.includes('nykaa.com')) {
        parsed.searchParams.set('utm_source', 'dealbot');
        parsed.searchParams.set('utm_medium', 'affiliate');
        return parsed.toString();
      }

      if (hostname.includes('meesho.com')) {
        parsed.searchParams.set('ref', `dealbot`);
        return parsed.toString();
      }

      if (hostname.includes('tatacliq.com')) {
        parsed.searchParams.set('src', 'dealbot');
        return parsed.toString();
      }

      return url;
    } catch {
      return url;
    }
  }

  /**
   * Normalize a URL: ensure HTTPS, strip tracking junk we don't need, keep essential path.
   */
  _normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.protocol = 'https:';

      const KEEP_PARAMS = ['dp', 'pid', 'cmp', 'p', 'id', 'product'];
      const STRIP_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
      STRIP_PARAMS.forEach(k => parsed.searchParams.delete(k));

      return parsed.toString();
    } catch {
      return url;
    }
  }
}

module.exports = AffiliateRouter;
