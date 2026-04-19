/**
 * Cuelinks API Integration Module
 * Handles all communication with the Cuelinks v2 API.
 * Note: Constructor no longer throws if API key is missing — it just disables API calls.
 * Use AffiliateRouter which wraps this with fallback logic.
 */

const axios = require('axios');
const logger = require('./logger');

const CUELINKS_API_BASE = 'https://api.cuelinks.com/v2';
const MAX_RETRIES = 3;
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
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  /**
   * Generate an affiliate link using the Cuelinks API
   */
  async generateLink(sourceUrl, subId = 'deal-bot-v2') {
    if (!this.client) throw new Error('Cuelinks API key not configured');
    if (!sourceUrl) throw new Error('sourceUrl is required');

    const payload = { source_url: sourceUrl, subid: subId };
    if (this.channelId) payload.channel_id = this.channelId;

    return this._makeRequest('POST', '/links.json', payload);
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

      const config = params ? { params } : {};
      const response = method === 'GET'
        ? await this.client.get(endpoint, config)
        : await this.client.post(endpoint, data, config);

      if (response.data.success === false) {
        throw new Error(`API Error: ${response.data.message || 'Unknown error'}`);
      }

      return response.data.data || response.data;
    } catch (error) {
      logger.warn(`Cuelinks request failed (attempt ${attempt}/${MAX_RETRIES})`, {
        endpoint, error: error.message
      });

      if (attempt < MAX_RETRIES) {
        await this._delay(RETRY_DELAY * attempt);
        return this._makeRequest(method, endpoint, data, params, attempt + 1);
      }

      throw error;
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CuelinksAPI;
