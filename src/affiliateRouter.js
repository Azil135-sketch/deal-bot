/**
   * Affiliate Router Module
   * Routes product URLs through affiliate tracking.
   * Priority: Cuelinks API → direct tracking params → passthrough
   *
   * Cuelinks v2 API:
   *   Base: https://www.cuelinks.com/api/v2
   *   Auth: "Token {api_key}" header
   *   Link generation: GET /links.json?url={product_url}&channel_id={channel_id}
   */

  const CuelinksAPI = require('./cuelinksAPI');
  const logger = require('./logger');

  class AffiliateRouter {
    constructor() {
      this.cuelinks = new CuelinksAPI();

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

      // Try Cuelinks API first
      try {
        const result = await this.cuelinks.generateLink(normalized, subId);
        if (result && result.includes('cuelinks.com')) {
          return { link: result, method: 'cuelinks' };
        }
      } catch (err) {
        // Not approved or API not configured — fall through to direct params
        logger.debug('Cuelinks link generation skipped/failed, trying direct tracking', { error: err.message });
      }

      // Direct affiliate tracking params (no approval needed for UTM attribution)
      const fallback = this._buildFallbackLink(normalized, subId);
      return { link: fallback, method: fallback !== normalized ? 'direct-param' : 'passthrough' };
    }

    /**
     * Fetch all active campaigns from Cuelinks (cached 1 hour).
     * @returns {Promise<Array>}
     */
    async getActiveCampaigns() {
      if (Date.now() - this._campaignCacheTime < this.CAMPAIGN_CACHE_TTL && this._campaignCache) {
        return this._campaignCache;
      }

      try {
        const campaigns = await this.cuelinks.getCampaigns();
        const list = Array.isArray(campaigns) ? campaigns : (campaigns?.data || []);
        this._campaignCache = list;
        this._campaignCacheTime = Date.now();
        logger.info(`Cuelinks: ${list.length} active campaigns fetched`);
        return list;
      } catch (error) {
        logger.warn('Failed to fetch Cuelinks campaigns', { error: error.message });
        return [];
      }
    }

    /**
     * Filter campaigns that are open / faster to approve for new publishers.
     * Amazon and Flipkart require manual approval — excluded here.
     */
    async getOpenCampaigns() {
      const all = await this.getActiveCampaigns();

      const HIGH_APPROVAL_BRANDS = [
        'myntra', 'ajio', 'nykaa', 'tatacliq', 'croma',
        'snapdeal', 'reliancedigital', 'shopsy',
        'bewakoof', 'clovia', 'pantaloons', 'lifestyle',
        'urbanic', 'libas', 'westside', 'fabindia',
        'firstcry', 'hopscotch', 'mothercare',
        'zivame', 'prettysecrets',
        'boat', 'noise', 'crossbeats', 'boult',
        'wow', 'mamaearth', 'mcaffeine', 'plum', 'minimalist',
        'healthkart', 'netmeds', 'pharmeasy', 'tata1mg',
        'lenskart', 'fastrack', 'titan',
        'pepperfry', 'hometown', 'ikea'
      ];

      return all.filter(c => {
        const name = (c.name || c.advertiser_name || '').toLowerCase();
        return HIGH_APPROVAL_BRANDS.some(b => name.includes(b));
      });
    }

    /**
     * Build a direct tracking link using known store UTM/ref parameters.
     * These are NOT paid affiliate links — just attribution tags while Cuelinks approval is pending.
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
          parsed.searchParams.set('utm_campaign', subId);
          return parsed.toString();
        }

        if (hostname.includes('meesho.com')) {
          // Meesho has no Cuelinks campaign — UTM tags only
          parsed.searchParams.set('utm_source', 'dealbot');
          parsed.searchParams.set('utm_medium', 'affiliate');
          return parsed.toString();
        }

        if (hostname.includes('tatacliq.com')) {
          parsed.searchParams.set('src', 'dealbot');
          return parsed.toString();
        }

        if (hostname.includes('tata1mg.com') || hostname.includes('1mg.com')) {
          parsed.searchParams.set('utm_source', 'dealbot');
          parsed.searchParams.set('utm_medium', 'affiliate');
          return parsed.toString();
        }

        if (hostname.includes('healthkart.com')) {
          parsed.searchParams.set('utm_source', 'dealbot');
          parsed.searchParams.set('utm_medium', 'affiliate');
          return parsed.toString();
        }

        return url;
      } catch {
        return url;
      }
    }

    /**
     * Normalize URL: ensure HTTPS, strip ad tracking noise, keep product path.
     * @private
     */
    _normalizeUrl(url) {
      try {
        const parsed = new URL(url);
        parsed.protocol = 'https:';

        const STRIP_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
        STRIP_PARAMS.forEach(k => parsed.searchParams.delete(k));

        return parsed.toString();
      } catch {
        return url;
      }
    }
  }

  module.exports = AffiliateRouter;
  