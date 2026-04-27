/**
 * Broadcaster v4
 * Sends deals to ALL configured channels:
 * - Telegram (primary channel)
 * - Distribution network (Reddit, Twitter, Discord, communities)
 * - GitHub Pages deal site (free SEO traffic)
 * - Webhook notifications
 * 
 * Features autonomous distribution - posts everywhere without manual intervention.
 */

const axios = require('axios');
const logger = require('./logger');
const ContentGenerator = require('./contentGenerator');
const GrowthEngine = require('./growthEngine');
const DistributionNetwork = require('./distributionNetwork');
const DealSiteGenerator = require('./dealSiteGenerator');

const TELEGRAM_RATE_LIMIT_MS = 1500;

class Broadcaster {
  constructor() {
    this.contentGenerator = new ContentGenerator();
    this.growthEngine = new GrowthEngine();
    this.distribution = new DistributionNetwork();
    this.dealSite = new DealSiteGenerator();
  }

  async broadcastAll(deals) {
    logger.info(`Broadcasting ${deals.length} deals to all channels`);
    const results = {};

    // 1. Telegram primary channel (most important)
    results.telegram = await this.broadcastToTelegram(deals);

    // 2. Distribution network (Reddit, Twitter, Discord, communities) - parallel
    try {
      results.distribution = await this.distribution.distributeAll(deals);
    } catch (error) {
      logger.warn('Distribution network error', { error: error.message });
      results.distribution = { error: error.message };
    }

    // 3. GitHub Pages deal site (free SEO traffic)
    try {
      results.dealSite = await this.dealSite.publish(deals);
    } catch (error) {
      logger.warn('Deal site error', { error: error.message });
      results.dealSite = { success: false, error: error.message };
    }

    // 4. Webhook notifications
    try {
      results.webhooks = await this.broadcastToWebhooks(deals);
    } catch (error) {
      logger.warn('Webhook broadcast error', { error: error.message });
      results.webhooks = { success: false, error: error.message };
    }

    // 5. Check for growth milestones
    try {
      await this.growthEngine.checkAndPostMilestone();
    } catch (error) {
      logger.debug('Milestone check error', { error: error.message });
    }

    logger.info('Broadcast complete', {
      telegram: results.telegram?.count || 0,
      distribution: results.distribution || 'completed'
    });

    return results;
  }

  async broadcastToTelegram(deals) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const rawChatIds = process.env.TELEGRAM_CHAT_ID || '';
    const chatIds = rawChatIds.split(',').map(c => c.trim()).filter(Boolean);

    if (!botToken || chatIds.length === 0) {
      logger.warn('Telegram not configured');
      return { success: false, message: 'Telegram not configured' };
    }

    let broadcastCount = 0;
    let failCount = 0;

    for (const chatId of chatIds) {
      for (const deal of deals) {
        try {
          const content = this.contentGenerator.generateContent(deal, 'telegram');
          if (!content) continue;

          const fullContent = content + this.growthEngine.buildViralFooter();
          await this._sendTelegramMessage(botToken, chatId, fullContent, deal);
          broadcastCount++;
          await this._delay(TELEGRAM_RATE_LIMIT_MS);
        } catch (error) {
          failCount++;
          logger.warn('Telegram broadcast failed', { dealId: deal.id, error: error.message });
        }
      }
    }

    logger.info(`Telegram: ${broadcastCount} sent, ${failCount} failed`);
    return { success: broadcastCount > 0, count: broadcastCount, failed: failCount };
  }

  async _sendTelegramMessage(botToken, chatId, content, deal) {
    const baseUrl = `https://api.telegram.org/bot${botToken}`;

    // Try photo message if we have an image URL
    if (deal.imageUrl) {
      try {
        await axios.post(`${baseUrl}/sendPhoto`, {
          chat_id: String(chatId),
          caption: content,
          parse_mode: 'HTML',
          photo: deal.imageUrl,
          disable_notification: false
        }, { timeout: 15000 });
        return;
      } catch {
        // Fall through to text message
      }
    }

    // Text message fallback
    await axios.post(`${baseUrl}/sendMessage`, {
      chat_id: chatId,
      text: content,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    }, { timeout: 10000 });
  }

  async broadcastToWebhooks(deals) {
    const rawWebhooks = process.env.DISTRIBUTION_WEBHOOKS || '';
    const webhooks = rawWebhooks.split(',').map(v => v.trim()).filter(Boolean);

    if (webhooks.length === 0) {
      logger.debug('No webhooks configured');
      return { success: false, message: 'No webhooks configured' };
    }

    let successCount = 0;
    for (const webhook of webhooks) {
      try {
        await axios.post(webhook, {
          deals: deals.map(d => ({
            id: d.id,
            title: d.title,
            discountedPrice: d.discountedPrice,
            originalPrice: d.originalPrice,
            discount: d.discount,
            affiliateLink: d.affiliateLink,
            source: d.source
          })),
          sentAt: new Date().toISOString(),
          source: 'deal-bot-v4'
        }, { timeout: 10000 });
        successCount++;
      } catch (error) {
        logger.warn('Webhook post failed', { webhook, error: error.message });
      }
    }
    return { success: successCount > 0, delivered: successCount, total: webhooks.length };
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Broadcaster;
