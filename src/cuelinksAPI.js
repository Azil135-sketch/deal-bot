/**
 * Cuelinks API Integration Module
 * Handles all communication with the Cuelinks v2 API.
 * Note: Constructor no longer throws if API key is missing — it just disables API calls.
 * Use AffiliateRouter which wraps this with fallback logic.
 *
 * Correct API base: https://www.cuelinks.com/api/v2
 * Auth header: Authorization: Token {api_key}
 * Link generation: GET /links.json?url={product_url}&channel_id={channel_id}
 */

const axios = require('axios');
const logger = require('./logger');

const CUELINKS_API_BASE = 'https://www.cuelinks.com/api/v2';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

class CuelinksAPI {
  constructor() {
    this.apiKey = process.env.CUELINKS_API_KEY;
    this.publisherId = process.env.CUELINKS_PUBLISHER_ID;
    this.channelId = process.env.CUELINKS_CHANNEL_ID;

    if (!this.apiKey) {
      logger.warn('CUELINKS_API_KEY not set — Cuelinks API calls will be skipped');
      this.client = null;
      return;
    }

    this.client = axios.create({
      baseURL: CUELINKS_API_BASE,
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Generate an affiliate link using the Cuelinks API.
   * GET /links.json?url={product_url}&channel_id={channel_id}
   */
  async generateLink(sourceUrl, subId = 'deal-bot-v2') {
    if (!this.client) throw new Error('Cuelinks API key not configured');
    if (!sourceUrl) throw new Error('sourceUrl is required');

    const params = { url: sourceUrl };
    if (this.channelId) params.channel_id = this.channelId;
    if (subId) params.subid = subId;

    const result = await this._makeRequest('GET', '/links.json', null, params);

    // Extract the affiliate link from the response
    if (result && result.affiliate_url) return result.affiliate_url;
    if (result && result.short_url) return result.short_url;
    if (result && result.link) return result.link;
    if (result && result.url) return result.url;
    if (typeof result === 'string') return result;

    throw new Error('No affiliate link in response');
  }

  /**
   * Get all active campaigns
   */
  async getCampaigns(country = null) {
    if (!this.client) return [];
    const params = country ? { country } : {};
    return this._makeRequest('GET', '/campaigns.json', null, params);
  }

  /**
   * Get transactions for a date range
   */
  async getTransactions(startDate, endDate, subId = null) {
    if (!this.client) return [];
    const params = { start_date: startDate, end_date: endDate };
    if (subId) params.subid = subId;
    return this._makeRequest('GET', '/transactions.json', null, params);
  }

  async _makeRequest(method, endpoint, data = null, params = null, attempt = 1) {
    try {
      logger.debug(`Cuelinks ${method} ${endpoint}`, { attempt });

      const config = {};
      if (params) config.params = params;

      const response = method === 'GET'
        ? await this.client.get(endpoint, config)
        : await this.client.post(endpoint, data, config);

      const d = response.data;

      // Cuelinks returns error fields as `error` or `errors`
      if (d && (d.error || d.errors)) {
        throw new Error(d.error || (Array.isArray(d.errors) ? d.errors.join(', ') : d.errors));
      }

      return d.data || d;
    } catch (error) {
      const msg = error.response?.data?.error || error.response?.data?.errors || error.message;
      logger.warn(`Cuelinks request failed (attempt ${attempt}/${MAX_RETRIES})`, {
        endpoint, error: msg
      });

      if (attempt < MAX_RETRIES && !msg?.includes('approval')) {
        await this._delay(RETRY_DELAY * attempt);
        return this._makeRequest(method, endpoint, data, params, attempt + 1);
      }

      throw new Error(String(msg));
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CuelinksAPI;
