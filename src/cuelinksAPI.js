/**
 * Cuelinks API Integration Module
 * Handles all communication with the Cuelinks v2 API
 */

const axios = require('axios');
const logger = require('./logger');

const CUELINKS_API_BASE = 'https://api.cuelinks.com/v2';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

class CuelinksAPI {
  constructor() {
    this.apiKey = process.env.CUELINKS_API_KEY;
    this.publisherId = process.env.CUELINKS_PUBLISHER_ID;
    this.channelId = process.env.CUELINKS_CHANNEL_ID;

    if (!this.apiKey) {
      throw new Error('CUELINKS_API_KEY environment variable is not set');
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
   * @param {string} sourceUrl - The original product URL
   * @param {string} subId - Sub ID for tracking (optional)
   * @returns {Promise<Object>} - Generated affiliate link data
   */
  async generateLink(sourceUrl, subId = 'deal-bot-v2') {
    if (!sourceUrl) {
      throw new Error('sourceUrl is required');
    }

    const payload = {
      source_url: sourceUrl,
      subid: subId
    };

    if (this.channelId) {
      payload.channel_id = this.channelId;
    }

    return this._makeRequest('POST', '/links.json', payload);
  }

  /**
   * Get all campaigns available to the user
   * @param {string} country - Country code (optional)
   * @returns {Promise<Array>} - List of campaigns
   */
  async getCampaigns(country = null) {
    const params = {};
    if (country) {
      params.country = country;
    }

    return this._makeRequest('GET', '/campaigns.json', null, params);
  }

  /**
   * Get transactions for a specific date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {string} subId - Sub ID for filtering (optional)
   * @returns {Promise<Array>} - List of transactions
   */
  async getTransactions(startDate, endDate, subId = null) {
    const params = {
      start_date: startDate,
      end_date: endDate
    };

    if (subId) {
      params.subid = subId;
    }

    return this._makeRequest('GET', '/transactions.json', null, params);
  }

  /**
   * Make an HTTP request to the Cuelinks API with retry logic
   * @private
   */
  async _makeRequest(method, endpoint, data = null, params = null, attempt = 1) {
    try {
      logger.debug(`Making ${method} request to ${endpoint}`, { attempt, data, params });

      const config = {};
      if (params) {
        config.params = params;
      }

      let response;
      if (method === 'GET') {
        response = await this.client.get(endpoint, config);
      } else if (method === 'POST') {
        response = await this.client.post(endpoint, data, config);
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }

      logger.debug(`Response received from ${endpoint}`, { status: response.status });

      // Check if response indicates success
      if (response.data.success === false) {
        throw new Error(`API Error: ${response.data.message || 'Unknown error'}`);
      }

      return response.data.data || response.data;
    } catch (error) {
      logger.warn(`Request failed (attempt ${attempt}/${MAX_RETRIES})`, {
        endpoint,
        error: error.message
      });

      // Retry logic
      if (attempt < MAX_RETRIES) {
        await this._delay(RETRY_DELAY * attempt);
        return this._makeRequest(method, endpoint, data, params, attempt + 1);
      }

      logger.error(`Request failed after ${MAX_RETRIES} attempts`, {
        endpoint,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Delay execution for specified milliseconds
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CuelinksAPI;
