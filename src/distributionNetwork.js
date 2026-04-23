/**
 * Autonomous Distribution Network v4 — Realistic Edition
 *
 * Posts deals to channels that actually work without approval barriers:
 * - Telegram (primary channel + communities)
 * - Discord (webhooks — no approval needed)
 * - GitHub Pages (SEO site — free)
 * - WhatsApp sharing links (generated, user shares)
 * - Reddit (automated if credentials work, manual fallback always available)
 * - Twitter/X (if API keys available)
 *
 * Reddit Note:
 *   reddit.com/prefs/apps can fail for some accounts.
 *   If automated posting doesn't work, use the manual post generator:
 *   node src/manualReddit.js
 */

const axios = require('axios');
const logger = require('./logger');

// Active Indian deal communities
const TELEGRAM_COMMUNITIES = [
  { name: 'Desi Deals Central', handle: '@desidealscentral' },
  { name: 'Online Shopping India', handle: '@onlineshoppingindia' },
  { name: 'Tech Deals India', handle: '@techdeals_india' },
  { name: 'Deals & Coupons India', handle: '@dealsandcouponsindia' },
  { name: 'Sale & Offers India', handle: '@saleoffersindia' },
  { name: 'Budget Shopping India', handle: '@budgetshopping_in' },
  { name: 'Myntra Deals', handle: '@myntradeals' },
  { name: 'Beauty Deals India', handle: '@beautydeals_india' },
];

class DistributionNetwork {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.apiBase = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;
    this.channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME || '';
    this.channelInviteLink = process.env.TELEGRAM_CHANNEL_INVITE_LINK || '';

    // Reddit
    this.redditClientId = process.env.REDDIT_CLIENT_ID;
    this.redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.redditUsername = process.env.REDDIT_USERNAME;
    this.redditPassword = process.env.REDDIT_PASSWORD;
    this.redditToken = null;
    this.redditTokenExpiry = 0;

    // Twitter
    this.twitterApiKey = process.env.TWITTER_API_KEY;
    this.twitterApiSecret = process.env.TWITTER_API_SECRET;
    this.twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
    this.twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;

    // Discord
    const rawDiscord = process.env.DISCORD_WEBHOOK_URL || '';
    this.discordWebhooks = rawDiscord.split(',').map(u => u.trim()).filter(Boolean);

    this.stats = {
      telegram: { posted: 0, failed: 0 },
      reddit: { posted: 0, failed: 0 },
      twitter: { posted: 0, failed: 0 },
      discord: { posted: 0, failed: 0 }
    };
  }

  async distributeAll(deals) {
    if (!deals || deals.length === 0) return this.stats;

    logger.info(`Distributing ${deals.length} deals`);

    await Promise.allSettled([
      this.distributeToCommunities(deals),
      this.postToReddit(deals),
      this.postToTwitter(deals),
      this.postToDiscord(deals)
    ]);

    logger.info('Distribution complete', this.stats);
    return this.stats;
  }

  // ─── TELEGRAM COMMUNITIES ──────────────────────────────────────────────────
  async distributeToCommunities(deals) {
    if (!this.apiBase) return;

    const targetCommunities = process.env.TARGET_COMMUNITIES
      ? process.env.TARGET_COMMUNITIES.split(',').map(c => c.trim())
      : [];

    if (targetCommunities.length === 0) {
      logger.debug('No TARGET_COMMUNITIES set — add group handles to cross-post automatically');
      return;
    }

    const topDeals = deals.slice(0, 3);
    for (const community of targetCommunities) {
      for (const deal of topDeals) {
        try {
          const msg = this._formatCommunityMessage(deal);
          await axios.post(`${this.apiBase}/sendMessage`, {
            chat_id: community,
            text: msg,
            parse_mode: 'HTML',
            disable_web_page_preview: false
          }, { timeout: 10000 });
          this.stats.telegram.posted++;
          await this._delay(3000);
        } catch (error) {
          this.stats.telegram.failed++;
          logger.debug(`Community post failed: ${community} — ${error.message}`);
        }
      }
    }
  }

  _formatCommunityMessage(deal) {
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const link = deal.affiliateLink || deal.productUrl;
    const store = (deal.source || 'Store').charAt(0).toUpperCase() + (deal.source || '').slice(1);

    let msg = `🔥 <b>${deal.title}</b>\n\n`;
    msg += `💰 <b>₹${deal.discountedPrice}</b> <s>₹${deal.originalPrice}</s> (${deal.discount}% OFF)`;
    if (savings > 100) msg += ` — Save ₹${savings}`;
    msg += `\n🛍️ ${store}\n\n`;
    msg += `<a href="${link}">🔗 Grab this deal →</a>\n\n`;
    if (this.channelInviteLink) {
      msg += `<i>More deals: ${this.channelInviteLink}</i>`;
    }
    return msg;
  }

  // ─── REDDIT ────────────────────────────────────────────────────────────────
  async postToReddit(deals) {
    if (!this.redditClientId || !this.redditUsername) {
      logger.debug('Reddit not configured — skipping automated posting');
      return;
    }

    try {
      await this._authenticateReddit();
    } catch (error) {
      logger.warn('Reddit auth failed — automated posting disabled. Use: node src/manualReddit.js', { error: error.message });
      return;
    }

    const topDeal = deals.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))[0];
    if (!topDeal) return;

    const subs = ['DesiDeal', 'IndiaShopping'];
    for (const sub of subs) {
      try {
        const title = this._buildRedditTitle(topDeal);
        const url = topDeal.affiliateLink || topDeal.productUrl;

        await axios.post('https://oauth.reddit.com/api/submit',
          new URLSearchParams({ sr: sub, kind: 'link', title: title.slice(0, 300), url, resubmit: 'true' }), {
            headers: {
              'Authorization': `Bearer ${this.redditToken}`,
              'User-Agent': 'DealBot:v4.0',
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
          }
        );
        this.stats.reddit.posted++;
        logger.info(`Posted to r/${sub}`);
        await this._delay(5000);
      } catch (error) {
        this.stats.reddit.failed++;
        logger.debug(`Reddit post failed: ${error.message}`);
      }
    }
  }

  _buildRedditTitle(deal) {
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = (deal.source || 'India').charAt(0).toUpperCase() + (deal.source || '').slice(1);
    return `[${store}] ${deal.title.slice(0, 100)} — ${deal.discount}% OFF, ₹${deal.discountedPrice} (Save ₹${savings})`;
  }

  async _authenticateReddit() {
    if (this.redditToken && Date.now() < this.redditTokenExpiry) return;

    const resp = await axios.post('https://www.reddit.com/api/v1/access_token',
      `grant_type=password&username=${encodeURIComponent(this.redditUsername)}&password=${encodeURIComponent(this.redditPassword)}`,
      {
        auth: { username: this.redditClientId, password: this.redditClientSecret },
        headers: { 'User-Agent': 'DealBot:v4.0', 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    this.redditToken = resp.data.access_token;
    this.redditTokenExpiry = Date.now() + (resp.data.expires_in - 60) * 1000;
  }

  // ─── TWITTER ───────────────────────────────────────────────────────────────
  async postToTwitter(deals) {
    if (!this.twitterApiKey || !this.twitterAccessToken) {
      logger.debug('Twitter not configured');
      return;
    }

    try {
      const topDeal = deals.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))[0];
      if (!topDeal) return;

      let tweet = `🔥 ${topDeal.title.slice(0, 80)}\n`;
      tweet += `💰 ₹${topDeal.discountedPrice} (${topDeal.discount}% OFF)\n`;
      tweet += `${topDeal.affiliateLink || topDeal.productUrl}\n`;
      tweet += '#IndiaDeals #OnlineShopping';

      if (tweet.length > 280) {
        tweet = `🔥 ${topDeal.title.slice(0, 60)} | ${topDeal.discount}% OFF | ₹${topDeal.discountedPrice}\n`;
        tweet += `${topDeal.affiliateLink || topDeal.productUrl}`;
      }

      // Requires: npm install twitter-api-v2
      const { TwitterApi } = require('twitter-api-v2');
      const client = new TwitterApi({
        appKey: this.twitterApiKey,
        appSecret: this.twitterApiSecret,
        accessToken: this.twitterAccessToken,
        accessSecret: this.twitterAccessSecret
      });

      await client.v2.tweet(tweet);
      this.stats.twitter.posted++;
      logger.info('Tweet posted');
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        logger.debug('Install "twitter-api-v2" for Twitter posting: npm install twitter-api-v2');
      } else {
        this.stats.twitter.failed++;
        logger.debug(`Twitter post failed: ${error.message}`);
      }
    }
  }

  // ─── DISCORD ──────────────────────────────────────────────────────────────
  async postToDiscord(deals) {
    if (this.discordWebhooks.length === 0) {
      logger.debug('Discord not configured');
      return;
    }

    const topDeals = deals.slice(0, 3);
    for (const webhook of this.discordWebhooks) {
      for (const deal of topDeals) {
        try {
          const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
          const link = deal.affiliateLink || deal.productUrl;
          const store = (deal.source || 'India').charAt(0).toUpperCase() + (deal.source || '').slice(1);

          await axios.post(webhook, {
            username: 'Deal Bot India',
            embeds: [{
              title: deal.title.slice(0, 256),
              url: link,
              color: deal.discount >= 60 ? 0xFF1744 : deal.discount >= 40 ? 0xFF9800 : 0x4CAF50,
              fields: [
                { name: '💰 Price', value: `₹${deal.discountedPrice}`, inline: true },
                { name: '💸 Original', value: `₹${deal.originalPrice}`, inline: true },
                { name: '📉 Discount', value: `${deal.discount}% OFF`, inline: true },
                { name: '💵 You Save', value: `₹${savings}`, inline: true },
                { name: '🛍️ Store', value: store, inline: true },
                { name: '🔗 Link', value: `[Buy Now](${link})`, inline: true }
              ],
              footer: { text: this.channelInviteLink || 'Deal Bot India v4' },
              timestamp: new Date().toISOString(),
              thumbnail: deal.imageUrl ? { url: deal.imageUrl } : undefined
            }]
          }, { timeout: 10000 });

          this.stats.discord.posted++;
          await this._delay(1500);
        } catch (error) {
          this.stats.discord.failed++;
          logger.debug(`Discord post failed: ${error.message}`);
        }
      }
    }
  }

  generateWhatsAppShareLink(deal) {
    const link = deal.affiliateLink || deal.productUrl;
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const text = encodeURIComponent(
      `🔥 *${deal.title}*\n` +
      `💰 ₹${deal.discountedPrice} (was ₹${deal.originalPrice})\n` +
      `📉 ${deal.discount}% OFF — Save ₹${savings}\n` +
      `🛍️ ${deal.source || 'Store'}\n\n` +
      `${link}`
    );
    return `https://wa.me/?text=${text}`;
  }

  generateShareLinks(deal) {
    const link = deal.affiliateLink || deal.productUrl;
    const title = encodeURIComponent(`${deal.title} — ${deal.discount}% OFF`);
    return {
      whatsapp: this.generateWhatsAppShareLink(deal),
      twitter: `https://twitter.com/intent/tweet?text=${title}&url=${encodeURIComponent(link)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${title}`,
      reddit: `https://reddit.com/submit?title=${title}&url=${encodeURIComponent(link)}`
    };
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DistributionNetwork;
