/**
 * Viral Growth Engine v4.1
 * 
 * Autonomous channel growth through:
 * - Referral tracking and rewards via ReferralTracker
 * - Smart milestone posts with engagement hooks
 * - Bot commands that drive shares
 * - Price drop alerts as re-engagement tool
 * - Cross-platform invite link generation with tracking
 */

const axios = require('axios');
const logger = require('./logger');
const ReferralTracker = require('./referralTracker');

class GrowthEngine {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.channelId = process.env.TELEGRAM_CHAT_ID;
    this.channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME || '';
    this.channelInviteLink = process.env.TELEGRAM_CHANNEL_INVITE_LINK || '';
    this.apiBase = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;

    this.referral = new ReferralTracker();
    this.subscribers = 0;
    this.milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  }

  /**
   * Generate viral footer appended to every deal post.
   */
  buildViralFooter() {
    const channelRef = this.channelUsername
      ? `@${this.channelUsername.replace('@', '')}`
      : (this.channelInviteLink || 'our channel');

    const tracked = this.referral.getAllTrackedLinks();
    const invite = tracked.telegram || this.channelInviteLink || channelRef;

    const lines = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      `💡 <b>Know someone who loves deals?</b>`,
      `👉 Forward this or share: ${invite}`,
      `🔔 Turn on notifications — never miss a deal`,
      '━━━━━━━━━━━━━━━━━━━━━'
    ];

    return lines.join('\n');
  }

  /**
   * Set up bot commands.
   */
  async setupBotCommands() {
    if (!this.apiBase) return;

    try {
      await axios.post(`${this.apiBase}/setMyCommands`, {
        commands: [
          { command: 'start', description: 'Welcome + invite link' },
          { command: 'deals', description: 'Latest hot deals' },
          { command: 'invite', description: 'Invite friends — get rewards' },
          { command: 'share', description: 'Share deals on WhatsApp' },
          { command: 'about', description: 'About this bot' },
          { command: 'top', description: 'Top deals today' }
        ]
      });
      logger.info('Bot commands configured');
    } catch (error) {
      logger.warn('Failed to configure bot commands', { error: error.message });
    }
  }

  /**
   * Handle incoming Telegram updates (commands).
   */
  async handleUpdate(update) {
    if (!this.apiBase) return;

    const message = update?.message;
    if (!message) return;

    const chatId = message.chat?.id;
    const text = (message.text || '').trim().toLowerCase();

    if (text === '/start') {
      await this._sendMessage(chatId, this._getWelcomeMessage(), 'HTML');
    } else if (text === '/invite') {
      await this._sendMessage(chatId, this._getInviteMessage(), 'Markdown');
    } else if (text === '/about') {
      await this._sendMessage(chatId, this._getAboutMessage(), 'Markdown');
    } else if (text === '/share') {
      await this._sendMessage(chatId, this._getShareMessage(), 'HTML');
    } else if (text === '/top') {
      await this._sendMessage(chatId, '🔥 Use /deals to see the latest top deals!', 'HTML');
    }
  }

  _getWelcomeMessage() {
    const channel = this.channelUsername ? `@${this.channelUsername.replace('@', '')}` : 'our channel';
    const link = this.channelInviteLink || `https://t.me/${channel}`;

    return `👋 <b>Welcome to Deal Bot India!</b>\n\n` +
      `I find the hottest deals from Myntra, Nykaa, Ajio, TataCliq & more — and send them directly to you.\n\n` +
      `📢 <b>Subscribe:</b> <a href="${link}">${channel}</a>\n` +
      `🔔 Turn on notifications to never miss a deal!\n\n` +
      `Use /invite to share with friends and earn rewards! 🎁`;
  }

  _getInviteMessage() {
    const tracked = this.referral.getAllTrackedLinks();
    const link = tracked.telegram || this.channelInviteLink || '';
    const whatsappLink = tracked.whatsapp || link;
    const redditLink = tracked.reddit || link;

    return `📣 *Share the Deals!*\n\n` +
      `Know someone who loves saving money?\n` +
      `Here are your tracked invite links:\n\n` +
      `*Telegram:* ${link}\n` +
      `*WhatsApp:* ${whatsappLink}\n` +
      `*Reddit:* ${redditLink}\n\n` +
      `*Why share?*\n` +
      `• More members = better deals\n` +
      `• Unlock exclusive deals at milestones\n` +
      `• Help others save money daily\n\n` +
      `Every invite counts! 🤝`;
  }

  _getAboutMessage() {
    return `*About Deal Bot India* 🤖\n\n` +
      `I'm an automated deal aggregator for India. I scan the web daily for genuine discounts (20%+ off, min ₹200 savings) from Myntra, Nykaa, Ajio, TataCliq, Healthkart & more.\n\n` +
      `*Features:*\n` +
      `✅ Real product links (not search pages)\n` +
      `✅ Stock checked before posting\n` +
      `✅ Price history tracking (spot fake discounts)\n` +
      `✅ Only high-quality, vetted deals\n` +
      `✅ 4-6x daily updates\n\n` +
      `_No spam. No fake deals. Just real savings._`;
  }

  _getShareMessage() {
    const link = this.channelInviteLink || (this.channelUsername ? `https://t.me/${this.channelUsername.replace('@', '')}` : '');
    return `📲 <b>Share deals on WhatsApp</b>\n\n` +
      `1. Tap any deal\n` +
      `2. Click the share button (top right)\n` +
      `3. Select WhatsApp\n\n` +
      `Or share the channel link:\n` +
      `<code>${link}</code>\n\n` +
      `Every share helps us grow! 🚀`;
  }

  async _sendMessage(chatId, text, parseMode = 'HTML') {
    try {
      await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true
      });
    } catch (error) {
      logger.warn('Failed to send message', { chatId, error: error.message });
    }
  }

  /**
   * Check subscriber count and post milestone messages.
   * Records subscriber history for velocity tracking.
   */
  async checkAndPostMilestone() {
    if (!this.apiBase || !this.channelId) return;

    try {
      const { count, growthVelocity, isNewMilestone } = await this.referral.recordSubscriberCount();
      this.subscribers = count;

      if (isNewMilestone) {
        const nextMilestone = this.milestones.find(m => m > this.subscribers * 0.5 && count >= m);
        if (nextMilestone) {
          await this._postMilestoneMessage(nextMilestone, growthVelocity);
        }
      }
    } catch (error) {
      logger.debug('Milestone check error', { error: error.message });
    }
  }

  async _postMilestoneMessage(count, velocity = 0) {
    const link = this.channelInviteLink || '';
    const velocityText = velocity > 0 ? `We're growing at ~${velocity} members/day.` : '';

    const messages = {
      10: `🎉 *We just hit 10 members!*\n\nEvery journey starts small. Thank you for being here from the beginning.\n\n👉 Share with friends: ${link}`,
      50: `🎉 *50 members strong!* 💪\n\n${velocityText}\nHelp us reach 100:\n👉 ${link}\n\n_Better deals coming as we grow_`,
      100: `🎉 *100 members!* 🎊\n\nThis is a real milestone. From 0 to 100 — thank you!\n\n🔓 *Unlocked:* Daily deal summaries\n👉 Share to unlock more: ${link}`,
      500: `🎉 *500 members!* 🚀\n\n${velocityText}\nHalfway to 1000! We're becoming a real community.\n\n🔓 *Unlocked:* Priority deal alerts\n👉 ${link}`,
      1000: `🎉 *1000 MEMBERS!* 🔥\n\nWe made it! 1000 deal hunters strong.\n\n🔓 *Unlocked:* Exclusive brand partnerships\n🔓 *Unlocked:* Weekly deal roundups\n\nThank you for trusting us! 💜`
    };

    const text = messages[count] || `🎉 *We just hit ${count} members!*\n\n${velocityText}\nThank you for being part of our community!\n\nHelp us grow:\n👉 ${link}`;

    try {
      const resp = await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: this.channelId,
        text,
        parse_mode: 'Markdown'
      });

      await axios.post(`${this.apiBase}/pinChatMessage`, {
        chat_id: this.channelId,
        message_id: resp.data?.result?.message_id,
        disable_notification: false
      });
    } catch (error) {
      logger.warn('Milestone post failed', { error: error.message });
    }
  }

  /**
   * Build shareable text for any platform.
   */
  buildShareableText(deal) {
    const tracked = this.referral.getAllTrackedLinks();
    const link = tracked.telegram || this.channelInviteLink || '';
    return `🔥 ${deal.title}\n` +
      `💰 ₹${deal.discountedPrice} (${deal.discount}% OFF)\n` +
      `🛍️ ${deal.affiliateLink || deal.productUrl}\n\n` +
      `📢 More deals: ${link}`;
  }
}

module.exports = GrowthEngine;
