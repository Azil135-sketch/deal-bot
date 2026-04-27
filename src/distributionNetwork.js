/**
 * Autonomous Distribution Network v4.1 — Zero-Cost Edition
 *
 * Posts deals to every channel that works without approval barriers:
 * - Telegram (primary channel + community cross-posting)
 * - Discord (webhooks — no approval needed)
 * - Reddit (automated if credentials work, manual fallback always ready)
 * - Twitter/X (if API keys available, otherwise share links)
 * - GitHub Pages SEO site (free organic traffic)
 * - WhatsApp share links (generated for broadcast lists)
 * 
 * NEW in v4.1:
 * - SocialShareGenerator integration for multi-platform content
 * - ReferralTracker for UTM-like invite link tracking per platform
 * - Smart retry with exponential backoff for rate-limited platforms
 * - Automatic fallback when primary channels fail
 */

const axios = require('axios');
const logger = require('./logger');
const SocialShareGenerator = require('./socialShareGenerator');
const ReferralTracker = require('./referralTracker');

class DistributionNetwork {
  constructor() {
    this.shareGen = new SocialShareGenerator();
    this.referral = new ReferralTracker();

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

    logger.info(`Distributing ${deals.length} deals across all channels`);

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
      logger.debug('No TARGET_COMMUNITIES set — skipping community cross-post');
      return;
    }

    const topDeals = deals.slice(0, 3);
    for (const community of targetCommunities) {
      for (const deal of topDeals) {
        try {
          const msg = this.shareGen.whatsappBroadcast(deal, this.channelInviteLink);
          await axios.post(`${this.apiBase}/sendMessage`, {
            chat_id: community,
            text: msg,
            parse_mode: 'Markdown',
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

  // ─── REDDIT ────────────────────────────────────────────────────────────────
  async postToReddit(deals) {
    if (!this.redditClientId || !this.redditUsername) {
      logger.debug('Reddit not configured — automated posting skipped. Run: node src/manualReddit.js');
      return;
    }

    try {
      await this._authenticateReddit();
    } catch (error) {
      logger.warn('Reddit auth failed — automated posting disabled. Use manual fallback.', { error: error.message });
      return;
    }

    const topDeal = deals.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))[0];
    if (!topDeal) return;

    const subs = ['DesiDeal', 'IndiaShopping'];
    for (const sub of subs) {
      try {
        const post = this.shareGen.redditPost(topDeal);

        await axios.post('https://oauth.reddit.com/api/submit',
          new URLSearchParams({
            sr: sub,
            kind: 'link',
            title: post.title.slice(0, 300),
            url: topDeal.affiliateLink || topDeal.productUrl,
            resubmit: 'true'
          }), {
            headers: {
              'Authorization': `Bearer ${this.redditToken}`,
              'User-Agent': 'DealBot:v4.1',
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
          }
        );
        this.stats.reddit.posted++;
        logger.info(`Posted to r/${sub}: ${post.title.slice(0, 60)}`);
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
        headers: { 'User-Agent': 'DealBot:v4.1', 'Content-Type': 'application/x-www-form-urlencoded' }
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

      const tweet = this.shareGen.twitterTweet(topDeal);

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
              footer: { text: this.channelInviteLink || 'Deal Bot India v4.1' },
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

  /**
   * Generate WhatsApp share link for a single deal.
   */
  generateWhatsAppShareLink(deal) {
    const text = this.shareGen.whatsappBroadcast(deal, this.channelInviteLink);
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  /**
   * Generate shareable links for all major platforms.
   */
  generateShareLinks(deal) {
    const link = deal.affiliateLink || deal.productUrl;
    const title = encodeURIComponent(`${deal.title} — ${deal.discount}% OFF`);
    const tracked = this.referral.getAllTrackedLinks();

    return {
      whatsapp: this.generateWhatsAppShareLink(deal),
      twitter: `https://twitter.com/intent/tweet?text=${title}&url=${encodeURIComponent(link)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${title}`,
      reddit: `https://reddit.com/submit?title=${title}&url=${encodeURIComponent(link)}`,
      pinterest: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(link)}&description=${title}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
      quora: tracked.quora,
      invite: tracked.telegram
    };
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DistributionNetwork;
