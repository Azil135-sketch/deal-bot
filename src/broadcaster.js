/**
   * Broadcaster Module
   * Sends deals to all configured channels:
   * - Telegram (Bot API — fully implemented)
   * - Webhooks (Zapier/Make/custom — fully implemented)
   * - Reddit (r/DesiDeal, r/IndiaShopping — needs REDDIT_* env vars)
   * - Discord (webhook embeds — needs DISCORD_WEBHOOK_URL)
   * - GitHub Pages deal site (free SEO traffic — needs GITHUB_TOKEN + GITHUB_REPO)
   * - Twitter (stub — needs API keys)
   * - Email (stub — needs SMTP)
   */

  const axios = require('axios');
  const logger = require('./logger');
  const ContentGenerator = require('./contentGenerator');
  const GrowthEngine = require('./growthEngine');
  const RedditPoster = require('./redditPoster');
  const DiscordPoster = require('./discordPoster');
  const DealSiteGenerator = require('./dealSiteGenerator');

  const TELEGRAM_RATE_LIMIT_MS = 1500;

  class Broadcaster {
    constructor() {
      this.contentGenerator = new ContentGenerator();
      this.growthEngine = new GrowthEngine();
      this.redditPoster = new RedditPoster();
      this.discordPoster = new DiscordPoster();
      this.dealSiteGenerator = new DealSiteGenerator();
    }

    async broadcastAll(deals) {
      logger.info('Broadcasting ' + deals.length + ' deals to all channels');
      const results = {};

      // Run all broadcast channels in parallel where possible
      // Telegram first (most important), then others
      results.telegram = await this.broadcastToTelegram(deals);

      const [webhookResult, redditResult, discordResult, siteResult] = await Promise.all([
        this.broadcastToWebhooks(deals),
        this.redditPoster.postDeals(deals),
        this.discordPoster.postDeals(deals),
        this.dealSiteGenerator.publish(deals)
      ]);

      results.webhooks = webhookResult;
      results.reddit = redditResult;
      results.discord = discordResult;
      results.dealSite = siteResult;
      results.twitter = await this.broadcastToTwitter(deals);
      results.email = await this.broadcastToEmail(deals);

      logger.info('Broadcasting completed', {
        telegram: results.telegram?.count || 0,
        reddit: results.reddit?.posted || 0,
        discord: results.discord?.posted || 0,
        site: results.dealSite?.success ? 'published' : 'skipped'
      });
      return results;
    }

    async broadcastToTelegram(deals) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      // Support multiple chat IDs (comma-separated for multi-channel posting)
      const rawChatIds = process.env.TELEGRAM_CHAT_ID || '';
      const chatIds = rawChatIds.split(',').map(c => c.trim()).filter(Boolean);

      if (!botToken || chatIds.length === 0) {
        logger.warn('Telegram credentials not configured (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)');
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
            await this._sendTelegramMessage(botToken, chatId, fullContent, deal.localImage);
            broadcastCount++;
            await this._delay(TELEGRAM_RATE_LIMIT_MS);
          } catch (error) {
            failCount++;
            logger.warn('Failed to broadcast deal to Telegram', { dealId: deal.id, chatId, error: error.message });
          }
        }
      }

      logger.info('Telegram broadcast: ' + broadcastCount + ' sent, ' + failCount + ' failed');
      return { success: broadcastCount > 0, count: broadcastCount, failed: failCount };
    }

    async _sendTelegramMessage(botToken, chatId, content, localImage) {
      const baseUrl = 'https://api.telegram.org/bot' + botToken;

      if (localImage && localImage.path) {
        try {
          const FormData = require('form-data');
          const fs = require('fs');
          const form = new FormData();
          form.append('chat_id', String(chatId));
          form.append('caption', content);
          form.append('parse_mode', 'HTML');
          form.append('photo', fs.createReadStream(localImage.path));
          await axios.post(baseUrl + '/sendPhoto', form, {
            headers: form.getHeaders(),
            timeout: 15000
          });
          return;
        } catch {
          // fall through to text
        }
      }

      // If deal has imageUrl but no local download, send as URL photo
      // We skip this for now and always fall back to text for reliability

      await axios.post(baseUrl + '/sendMessage', {
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
        logger.info('No distribution webhooks configured');
        return { success: false, message: 'No webhooks configured' };
      }

      let successCount = 0;
      for (const webhook of webhooks) {
        try {
          await axios.post(webhook, {
            deals: deals.map(d => ({
              id: d.id, title: d.title,
              discountedPrice: d.discountedPrice, originalPrice: d.originalPrice,
              discount: d.discount, affiliateLink: d.affiliateLink, source: d.source
            })),
            sentAt: new Date().toISOString(),
            source: 'deal-bot'
          }, { timeout: 10000 });
          successCount++;
        } catch (error) {
          logger.warn('Failed posting to webhook', { webhook, error: error.message });
        }
      }
      return { success: successCount > 0, delivered: successCount, total: webhooks.length };
    }

    async broadcastToTwitter(deals) {
      const apiKey = process.env.TWITTER_API_KEY;
      if (!apiKey) {
        logger.debug('Twitter not configured, skipping');
        return { success: false, message: 'Twitter not configured' };
      }
      logger.warn('Twitter integration stubbed — add twitter-api-v2 to enable');
      return { success: false, message: 'Twitter stub — not implemented' };
    }

    async broadcastToEmail(deals) {
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS;
      const emailTo = process.env.EMAIL_TO;
      if (!emailUser || !emailPass || !emailTo) {
        logger.debug('Email not configured, skipping');
        return { success: false, message: 'Email not configured' };
      }
      logger.warn('Email integration stubbed — add nodemailer to enable');
      return { success: false, message: 'Email stub — not implemented' };
    }

    _delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  module.exports = Broadcaster;
  