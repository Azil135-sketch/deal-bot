/**
 * Broadcaster Module
 * Handles broadcasting deals to channels:
 * - Telegram (real Bot API — fully implemented)
 * - Webhooks (Zapier/Make/custom — fully implemented)
 * - Twitter (stub — needs API keys)
 * - Email (stub — needs SMTP config)
 */

const axios = require('axios');
const logger = require('./logger');
const ContentGenerator = require('./contentGenerator');
const GrowthEngine = require('./growthEngine');

const TELEGRAM_RATE_LIMIT_MS = 1500;

class Broadcaster {
  constructor() {
    this.contentGenerator = new ContentGenerator();
    this.growthEngine = new GrowthEngine();
  }

  /**
   * Broadcast deals to all configured channels
   */
  async broadcastAll(deals) {
    logger.info(`Broadcasting ${deals.length} deals`);

    const results = {};

    results.telegram = await this.broadcastToTelegram(deals);
    results.webhooks = await this.broadcastToWebhooks(deals);
    results.twitter = await this.broadcastToTwitter(deals);
    results.email = await this.broadcastToEmail(deals);

    logger.info('Broadcasting completed', results);
    return results;
  }

  /**
   * Broadcast to Telegram — FULLY IMPLEMENTED
   */
  async broadcastToTelegram(deals) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      logger.warn('Telegram credentials not configured (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)');
      return { success: false, message: 'Telegram not configured' };
    }

    let broadcastCount = 0;
    let failCount = 0;

    for (const deal of deals) {
      try {
        const content = this.contentGenerator.generateContent(deal, 'telegram');
        if (!content) continue;

        // Append viral growth footer
        const fullContent = content + this.growthEngine.buildViralFooter();

        await this._sendTelegramMessage(botToken, chatId, fullContent, deal.localImage);
        broadcastCount++;
        logger.debug(`Sent deal to Telegram: ${deal.id}`);

        // Rate limit: Telegram allows ~1 message/sec per chat
        await this._delay(TELEGRAM_RATE_LIMIT_MS);
      } catch (error) {
        failCount++;
        logger.warn(`Failed to broadcast deal ${deal.id} to Telegram`, { error: error.message });
      }
    }

    logger.info(`Telegram broadcast: ${broadcastCount} sent, ${failCount} failed`);
    return { success: broadcastCount > 0, count: broadcastCount, failed: failCount };
  }

  /**
   * Send one message to Telegram. Tries photo if imageUrl is present, falls back to text.
   */
  async _sendTelegramMessage(botToken, chatId, content, localImage) {
    const baseUrl = `https://api.telegram.org/bot${botToken}`;

    if (localImage && localImage.path) {
      try {
        const FormData = require('form-data');
        const fs = require('fs');
        const form = new FormData();
        form.append('chat_id', String(chatId));
        form.append('caption', content);
        form.append('parse_mode', 'Markdown');
        form.append('photo', fs.createReadStream(localImage.path));

        await axios.post(`${baseUrl}/sendPhoto`, form, {
          headers: form.getHeaders(),
          timeout: 15000
        });
        return;
      } catch {
        // fall through to text message
      }
    }

    await axios.post(`${baseUrl}/sendMessage`, {
      chat_id: chatId,
      text: content,
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    }, { timeout: 10000 });
  }

  /**
   * Broadcast to webhooks (Zapier / Make / custom)
   */
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
            id: d.id,
            title: d.title,
            discountedPrice: d.discountedPrice,
            originalPrice: d.originalPrice,
            discount: d.discount,
            affiliateLink: d.affiliateLink,
            source: d.source
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

  /**
   * Broadcast to Twitter — STUB (needs TWITTER_API_KEY + TWITTER_API_SECRET)
   */
  async broadcastToTwitter(deals) {
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      logger.info('Twitter credentials not configured, skipping');
      return { success: false, message: 'Twitter not configured' };
    }

    // To enable Twitter: install twitter-api-v2 and uncomment below
    // const { TwitterApi } = require('twitter-api-v2');
    // const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret: accessTokenSecret });
    // for (const deal of deals) {
    //   const text = this.contentGenerator.generateContent(deal, 'twitter');
    //   if (text) await client.v2.tweet(text);
    // }

    logger.warn('Twitter integration stubbed — add twitter-api-v2 package to enable');
    return { success: false, message: 'Twitter stub — not implemented yet' };
  }

  /**
   * Broadcast via Email — STUB (needs SMTP credentials)
   */
  async broadcastToEmail(deals) {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const emailTo = process.env.EMAIL_TO;

    if (!emailUser || !emailPass || !emailTo) {
      logger.info('Email credentials not configured, skipping');
      return { success: false, message: 'Email not configured' };
    }

    // To enable Email: install nodemailer and uncomment below
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: emailUser, pass: emailPass } });
    // const html = deals.map(d => this.contentGenerator.generateContent(d, 'email')).join('<hr>');
    // await transporter.sendMail({ from: emailUser, to: emailTo, subject: "Today's Hot Deals", html });

    logger.warn('Email integration stubbed — add nodemailer to enable');
    return { success: false, message: 'Email stub — not implemented yet' };
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

async function main() {
  try {
    require('dotenv').config();
    const broadcaster = new Broadcaster();
    const exampleDeals = [
      {
        id: 'test-001', title: 'Premium Wireless Headphones',
        originalPrice: 5999, discountedPrice: 2999, discount: 50,
        source: 'amazon', productUrl: 'https://amazon.in/dp/B0EXAMPLE01',
        affiliateLink: 'https://cuelinks.com/l/xxxxx', qualityScore: 55
      }
    ];
    const results = await broadcaster.broadcastAll(exampleDeals);
    console.log('\n--- BROADCAST RESULTS ---\n', JSON.stringify(results, null, 2));
  } catch (error) {
    logger.error('Fatal error in broadcaster', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = Broadcaster;
