/**
   * Reddit Poster Module
   * Posts deals to Indian deal subreddits for free organic distribution.
   *
   * Subreddits targeted:
   * - r/DesiDeal — largest Indian deals subreddit (~60K members)
   * - r/india — 2.5M members, deal posts permitted in threads
   * - r/IndiaShopping — targeted shopping community
   *
   * Setup (all free):
   * 1. Create a Reddit account at reddit.com
   * 2. Go to https://www.reddit.com/prefs/apps
   * 3. Click "Create App" → type: "script"
   * 4. Fill in name (e.g. "dealbot"), redirect URI: http://localhost:8080
   * 5. Add REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD to .env
   *
   * Rate limits: Reddit allows ~1 post per 10 minutes per account.
   * The bot posts max 1 deal per subreddit per run — stays well within limits.
   */

  const axios = require('axios');
  const logger = require('./logger');

  const REDDIT_AUTH_URL = 'https://www.reddit.com/api/v1/access_token';
  const REDDIT_API_URL = 'https://oauth.reddit.com/api/submit';
  const USER_AGENT = 'DealBot:v3.0 (by /u/dealbot_india)';

  // Only post to subreddits that explicitly welcome deal posts
  const TARGET_SUBREDDITS = [
    { name: 'DesiDeal', flairRequired: false, type: 'link', maxPerRun: 1 },
    { name: 'IndiaShopping', flairRequired: false, type: 'link', maxPerRun: 1 }
  ];

  class RedditPoster {
    constructor() {
      this.clientId = process.env.REDDIT_CLIENT_ID;
      this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
      this.username = process.env.REDDIT_USERNAME;
      this.password = process.env.REDDIT_PASSWORD;
      this.enabled = !!(this.clientId && this.clientSecret && this.username && this.password);
      this.accessToken = null;
      this.tokenExpiry = 0;
    }

    /**
     * Post best deals to all configured subreddits.
     * @param {Array} deals — fully processed deals with affiliate links
     * @returns {Promise<Object>}
     */
    async postDeals(deals) {
      if (!this.enabled) {
        logger.info('Reddit poster not configured (REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD missing)');
        return { success: false, message: 'Reddit not configured' };
      }

      if (!deals || deals.length === 0) {
        return { success: false, message: 'No deals to post' };
      }

      // Sort by quality score descending, pick the best deal
      const sorted = [...deals].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
      const bestDeal = sorted[0];

      let posted = 0;
      let failed = 0;

      try {
        await this._authenticate();
      } catch (error) {
        logger.warn('Reddit auth failed', { error: error.message });
        return { success: false, message: `Auth failed: ${error.message}` };
      }

      for (const sub of TARGET_SUBREDDITS) {
        try {
          const result = await this._submitPost(bestDeal, sub.name);
          if (result) {
            posted++;
            logger.info(`Reddit: posted to r/${sub.name} — "${bestDeal.title.slice(0, 50)}"`);
            // Wait between posts to respect rate limits
            await this._delay(3000);
          }
        } catch (error) {
          failed++;
          logger.warn(`Reddit: failed to post to r/${sub.name}`, { error: error.message });
        }
      }

      return { success: posted > 0, posted, failed, deal: bestDeal.title };
    }

    /**
     * Submit a single post to a subreddit.
     * @private
     */
    async _submitPost(deal, subreddit) {
      const title = this._buildRedditTitle(deal);
      const url = deal.affiliateLink || deal.productUrl;

      // For Reddit, we use "link" post type with the product URL
      const payload = new URLSearchParams({
        sr: subreddit,
        kind: 'link',
        title: title,
        url: url,
        resubmit: 'true',
        nsfw: 'false',
        spoiler: 'false'
      });

      const resp = await axios.post(REDDIT_API_URL, payload.toString(), {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      });

      const data = resp.data;

      // Reddit returns errors in a specific format
      if (data?.json?.errors && data.json.errors.length > 0) {
        const err = data.json.errors[0];
        throw new Error(`Reddit error: ${err[0]} — ${err[1]}`);
      }

      return data?.json?.data?.url || data?.json?.data?.id || true;
    }

    /**
     * Build a Reddit-friendly post title.
     * Reddit titles should be informative, not clickbait.
     * @private
     */
    _buildRedditTitle(deal) {
      const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
      const store = (deal.source || 'India').charAt(0).toUpperCase() + (deal.source || 'India').slice(1);
      return `[${store}] ${deal.title.slice(0, 100)} — ${deal.discount}% OFF, ₹${deal.discountedPrice} (Save ₹${savings})`;
    }

    /**
     * OAuth2 authentication using Reddit's password flow.
     * @private
     */
    async _authenticate() {
      if (this.accessToken && Date.now() < this.tokenExpiry) return;

      const resp = await axios.post(REDDIT_AUTH_URL,
        'grant_type=password&username=' + encodeURIComponent(this.username) + '&password=' + encodeURIComponent(this.password),
        {
          auth: { username: this.clientId, password: this.clientSecret },
          headers: {
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      if (resp.data?.access_token) {
        this.accessToken = resp.data.access_token;
        this.tokenExpiry = Date.now() + (resp.data.expires_in - 60) * 1000;
        logger.info('Reddit: authenticated successfully');
      } else {
        throw new Error('No access token in response');
      }
    }

    _delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  module.exports = RedditPoster;
  