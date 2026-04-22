/**
 * Viral Growth Engine v4
 * 
 * Autonomous channel growth through:
 * - Referral tracking and rewards
 * - Cross-promotion network
 * - SEO content generation
 * - Viral loop mechanics
 * - Community engagement automation
 * - Analytics and optimization
 */

const axios = require('axios');
const logger = require('./logger');

class GrowthEngine {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.channelId = process.env.TELEGRAM_CHAT_ID;
    this.channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME || '';
    this.channelInviteLink = process.env.TELEGRAM_CHANNEL_INVITE_LINK || '';
    this.apiBase = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;

    // Growth tracking
    this.referralCode = process.env.REFERRAL_CODE || 'DEALBOT';
    this.subscribers = 0;
    this.lastMilestone = 0;
    this.milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  }

  /**
   * Generate viral footer appended to every deal post.
   */
  buildViralFooter() {
    const channelRef = this.channelUsername
      ? `@${this.channelUsername.replace('@', '')}`
      : (this.channelInviteLink || 'our channel');

    const lines = [
      '',
      '━━━━━━━━━━━━━━━━━━━━━',
      `💡 <b>Know someone who loves deals?</b>`,
      `👉 Forward this deal or share ${channelRef}`,
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
          { command: 'invite', description: 'Invite friends - get rewards' },
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
   * Handle incoming Telegram updates.
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
    const link = this.channelInviteLink || (this.channelUsername ? `https://t.me/${this.channelUsername.replace('@', '')}` : '');
    const referralLink = link ? `${link}?start=${this.referralCode}` : link;

    return `📣 *Share the Deals!*\n\n` +
      `Know someone who loves saving money?\n` +
      `Send them this link:\n\n` +
      `${referralLink}\n\n` +
      `*Why share?*\n` +
      `• More members = better deals\n` +
      `• Unlock exclusive deals at milestones\n` +
      `• Help others save money daily\n\n` +
      `Every invite counts! 🤝`;
  }

  _getAboutMessage() {
    return `*About Deal Bot India* 🤖\n\n` +
      `I'm an automated deal aggregator for India. I scan the web daily for genuine discounts (20%+ off, min ₹200 savings) from Myntra, Nykaa, Ajio, TataCliq, Mamaearth, Minimalist & more.\n\n` +
      `*Features:*\n` +
      `✅ Real product links (not search pages)\n` +
      `✅ Stock checked before posting\n` +
      `✅ Only high-quality, vetted deals\n` +
      `✅ 4x daily updates\n\n` +
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
   */
  async checkAndPostMilestone() {
    if (!this.apiBase || !this.channelId) return;

    try {
      const resp = await axios.post(`${this.apiBase}/getChatMemberCount`, {
        chat_id: this.channelId
      });
      const count = resp.data?.result || 0;
      this.subscribers = count;

      const nextMilestone = this.milestones.find(m => m > this.lastMilestone && count >= m);
      if (nextMilestone) {
        await this._postMilestoneMessage(nextMilestone);
        this.lastMilestone = nextMilestone;
      }
    } catch (error) {
      logger.debug('Failed to get subscriber count', { error: error.message });
    }
  }

  async _postMilestoneMessage(count) {
    const link = this.channelInviteLink || '';
    const messages = {
      10: `🎉 *We just hit 10 members!*\n\nEvery journey starts small. Thank you for being here from the beginning.\n\n👉 Share with friends: ${link}`,
      50: `🎉 *50 members strong!* 💪\n\nWe're growing! Help us reach 100:\n👉 ${link}\n\n_Better deals coming as we grow_`,
      100: `🎉 *100 members!* 🎊\n\nThis is a real milestone. From 0 to 100 — thank you!\n\n🔓 *Unlocked:* Daily deal summaries\n👉 Share to unlock more: ${link}`,
      500: `🎉 *500 members!* 🚀\n\nHalfway to 1000! We're becoming a real community.\n\n🔓 *Unlocked:* Priority deal alerts\n👉 ${link}`,
      1000: `🎉 *1000 MEMBERS!* 🔥\n\nWe made it! 1000 deal hunters strong.\n\n🔓 *Unlocked:* Exclusive brand partnerships\n🔓 *Unlocked:* Weekly deal roundups\n\nThank you for trusting us! 💜`
    };

    const text = messages[count] || `🎉 *We just hit ${count} members!*\n\nThank you for being part of our community!\n\nHelp us grow:\n👉 ${link}`;

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
    const link = this.channelInviteLink || (this.channelUsername ? `https://t.me/${this.channelUsername.replace('@', '')}` : '');
    return `🔥 ${deal.title}\n` +
      `💰 ₹${deal.discountedPrice} (${deal.discount}% OFF)\n` +
      `🛍️ ${deal.affiliateLink || deal.productUrl}\n\n` +
      `📢 More deals: ${link}`;
  }
}

module.exports = GrowthEngine;
