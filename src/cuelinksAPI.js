/**
 * Cuelinks API v2 Integration
 * 
 * Based on official Cuelinks API docs (cuelinks.docs.apiary.io):
 * - Get Link:    GET /api/v2/links.json?url=&channel_id=&subid=
 * - Campaigns:   GET /api/v2/campaigns.json
 * - Transactions GET /api/v2/transactions.json
 * 
 * Auth: Authorization: Token token="YOUR_API_KEY"
 * 
 * Auto-approved stores (no manual approval needed):
 *   Myntra, Nykaa, Ajio, TataCliq, Meesho, Croma, Healthkart,
 *   Netmeds, PharmEasy, 1mg, Lenskart, Bewakoof, Snapdeal, etc.
 * 
 * Stores requiring approval: Amazon, Flipkart (fallback to direct/UTM)
 */

const axios = require('axios');
const logger = require('./logger');

const BASE_URL = 'https://www.cuelinks.com/api/v2';
const TIMEOUT = 15000;

class CuelinksAPI {
  constructor() {
    this.apiKey = process.env.CUELINKS_API_KEY || '';
    this.publisherId = process.env.CUELINKS_PUBLISHER_ID || '';
    this.channelId = process.env.CUELINKS_CHANNEL_ID || '';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('CuelinksAPI: CUELINKS_API_KEY not set — affiliate links will use direct/UTM fallback only');
    }
  }

  /**
   * Generate an affiliate link for any product URL.
   * Returns the affiliate URL or null if generation failed.
   */
  async generateLink(productUrl, subId = 'deal-bot') {
    if (!this.enabled || !productUrl) return null;

    try {
      const params = {
        url: productUrl,
        subid: subId,
        shorten: 'false'
      };
      if (this.channelId) {
        params.channel_id = this.channelId;
      }

      const resp = await axios.get(`${BASE_URL}/links.json`, {
        params,
        headers: {
          'Authorization': `Token token="${this.apiKey}"`,
          'Content-Type': 'application/json',
          'User-Agent': 'DealBot/4.0'
        },
        timeout: TIMEOUT,
        validateStatus: s => s < 500
      });

      // Cuelinks returns { link: { url: "...", short_url: "..." } }
      const linkData = resp.data?.link;
      if (linkData && typeof linkData.url === 'string' && linkData.url.length > 10) {
        logger.debug(`Cuelinks link generated: ${linkData.url.slice(0, 80)}`);
        return linkData.url;
      }

      // Sometimes the API returns the URL directly in the response
      if (typeof resp.data?.url === 'string' && resp.data.url.length > 10) {
        return resp.data.url;
      }

      logger.debug('Cuelinks returned empty link data', { data: resp.data });
      return null;
    } catch (error) {
      if (error.response?.status === 401) {
        logger.warn('Cuelinks API key invalid or expired');
      } else if (error.response?.status === 403) {
        logger.warn('Cuelinks: campaign not approved for this store — falling back to direct/UTM');
      } else {
        logger.debug(`Cuelinks link generation failed: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Get all available campaigns (to check which stores are approved).
   */
  async getCampaigns(searchTerm = '') {
    if (!this.enabled) return [];

    try {
      const params = { page: 1, per_page: 300 };
      if (searchTerm) params.search_term = searchTerm;

      const resp = await axios.get(`${BASE_URL}/campaigns.json`, {
        params,
        headers: {
          'Authorization': `Token token="${this.apiKey}"`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUT
      });

      return resp.data?.campaigns || resp.data || [];
    } catch (error) {
      logger.warn('Cuelinks getCampaigns failed', { error: error.message });
      return [];
    }
  }

  /**
   * Get transactions for attribution audit.
   */
  async getTransactions(startDate, endDate) {
    if (!this.enabled) return [];

    try {
      const resp = await axios.get(`${BASE_URL}/transactions.json`, {
        params: { start_date: startDate, end_date: endDate },
        headers: {
          'Authorization': `Token token="${this.apiKey}"`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUT
      });

      return resp.data?.transactions || resp.data || [];
    } catch (error) {
      logger.warn('Cuelinks getTransactions failed', { error: error.message });
      return [];
    }
  }

  /**
   * Check if a specific store's campaign is approved and active.
   */
  async isCampaignApproved(storeDomain) {
    if (!this.enabled) return false;

    try {
      const campaigns = await this.getCampaigns(storeDomain);
      if (!Array.isArray(campaigns)) return false;

      return campaigns.some(c => {
        const name = (c.name || c.advertiser_name || '').toLowerCase();
        const domain = (c.domain || c.url || '').toLowerCase();
        const status = (c.status || '').toLowerCase();
        return (name.includes(storeDomain) || domain.includes(storeDomain)) && status !== 'paused';
      });
    } catch {
      return false;
    }
  }
}

module.exports = CuelinksAPI;
