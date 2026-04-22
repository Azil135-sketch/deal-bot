/**
   * Discord Poster Module
   * Posts deals to Discord channels via webhooks.
   * 100% free — just create a webhook in any Discord channel.
   *
   * Setup:
   * 1. In your Discord server, go to channel settings -> Integrations -> Webhooks
   * 2. Create a webhook, copy the URL
   * 3. Add DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... to your .env
   *    Multiple webhooks: DISCORD_WEBHOOK_URL=url1,url2
   */

  const axios = require('axios');
  const logger = require('./logger');

  class DiscordPoster {
    constructor() {
      const raw = process.env.DISCORD_WEBHOOK_URL || '';
      this.webhooks = raw.split(',').map(u => u.trim()).filter(Boolean);
      this.enabled = this.webhooks.length > 0;
    }

    async postDeals(deals) {
      if (!this.enabled) {
        logger.info('Discord poster not configured (DISCORD_WEBHOOK_URL missing)');
        return { success: false, message: 'Discord not configured' };
      }
      if (!deals || deals.length === 0) {
        return { success: false, message: 'No deals to post' };
      }

      let posted = 0;
      let failed = 0;
      const topDeals = [...deals]
        .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
        .slice(0, 3);

      for (const webhook of this.webhooks) {
        for (const deal of topDeals) {
          try {
            await this._postEmbed(webhook, deal);
            posted++;
            await this._delay(1200);
          } catch (error) {
            failed++;
            logger.warn('Discord post failed', { error: error.message });
          }
        }
      }

      logger.info('Discord: ' + posted + ' posted, ' + failed + ' failed');
      return { success: posted > 0, posted, failed };
    }

    async _postEmbed(webhookUrl, deal) {
      const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
      const link = deal.affiliateLink || deal.productUrl;
      const store = (deal.source || 'India').charAt(0).toUpperCase() + (deal.source || '').slice(1);
      const color = deal.discount >= 50 ? 0x00C853 : deal.discount >= 35 ? 0xFF6D00 : 0x2196F3;

      const embed = {
        title: deal.title.slice(0, 256),
        url: link,
        color,
        fields: [
          { name: 'Price', value: 'Rs.' + deal.discountedPrice, inline: true },
          { name: 'Was', value: 'Rs.' + deal.originalPrice, inline: true },
          { name: 'Discount', value: deal.discount + '% OFF (Save Rs.' + savings + ')', inline: true },
          { name: 'Rating', value: deal.rating ? deal.rating + '/5' : 'N/A', inline: true },
          { name: 'Store', value: store, inline: true },
          { name: 'Buy Now', value: '[Click here](' + link + ')', inline: true }
        ],
        footer: { text: 'Subscribe on Telegram for more deals' },
        timestamp: new Date().toISOString()
      };

      if (deal.imageUrl) {
        embed.thumbnail = { url: deal.imageUrl };
      }

      await axios.post(webhookUrl, {
        username: 'Deal Bot India',
        embeds: [embed]
      }, { timeout: 10000 });
    }

    _delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  module.exports = DiscordPoster;
  