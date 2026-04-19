/**
   * Growth Engine Module
   * Handles Telegram channel growth via:
   * 1. Bot commands to encourage sharing and invite friends
   * 2. Auto-post to free deal communities (Telegram groups accepting bots)
   * 3. Group cross-posting strategy (manual + semi-automated)
   * 4. Viral referral messages embedded in deal posts
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
    }

    /**
     * Generate a viral footer to append to every deal post.
     */
    buildViralFooter() {
      const channelRef = this.channelUsername
        ? `@${this.channelUsername.replace('@', '')}`
        : (this.channelInviteLink || 'our channel');

      const lines = [
        '',
        '━━━━━━━━━━━━━━━━━━━━━',
        `💡 <b>Know someone who loves deals?</b>`,
        `👉 Share this post or forward them to ${channelRef}`,
        `🔔 Turn on notifications so you never miss a deal`,
        '━━━━━━━━━━━━━━━━━━━━━'
      ];

      return lines.join('\n');
    }

    /**
     * Set up Telegram bot commands for interaction.
     */
    async setupBotCommands() {
      if (!this.apiBase) return;

      try {
        await axios.post(`${this.apiBase}/setMyCommands`, {
          commands: [
            { command: 'start', description: 'Welcome + invite link' },
            { command: 'deals', description: 'Latest hot deals' },
            { command: 'invite', description: 'Invite friends to the channel' },
            { command: 'about', description: 'About this bot' }
          ]
        });
        logger.info('Telegram bot commands configured');
      } catch (error) {
        logger.warn('Failed to configure bot commands', { error: error.message });
      }
    }

    /**
     * Handle incoming Telegram updates (webhook mode)
     */
    async handleUpdate(update) {
      if (!this.apiBase) return;

      const message = update?.message;
      if (!message) return;

      const chatId = message.chat?.id;
      const text = (message.text || '').trim().toLowerCase();

      if (text === '/start') {
        await this._sendMessage(chatId, this._getWelcomeMessage());
      } else if (text === '/invite') {
        await this._sendMessage(chatId, this._getInviteMessage());
      } else if (text === '/about') {
        await this._sendMessage(chatId, this._getAboutMessage());
      }
    }

    _getWelcomeMessage() {
      const channel = this.channelUsername ? `@${this.channelUsername.replace('@', '')}` : 'our channel';
      return `👋 *Welcome to Deal Bot!*\n\nI find the hottest deals from Myntra, Nykaa, Ajio, TataCliq & more — and send them directly to you.\n\n📢 *Subscribe to our channel:* ${this.channelInviteLink || channel}\n\n🔔 Turn on notifications to never miss a deal!\n\nUse /invite to share with friends.`;
    }

    _getInviteMessage() {
      const link = this.channelInviteLink || (this.channelUsername ? `https://t.me/${this.channelUsername.replace('@', '')}` : 'our channel');
      return `📣 *Share the Deals!*\n\nKnow someone who loves saving money?\nSend them this link:\n\n${link}\n\nEvery new member = more deals shared = more savings for everyone! 🤝`;
    }

    _getAboutMessage() {
      return `*About Deal Bot* 🤖\n\nI'm an automated deal aggregator for India. I scan the web daily for genuine discounts (20%+ off, min ₹200 savings) from Myntra, Nykaa, Ajio, TataCliq, Mamaearth, Minimalist & more.\n\n_No spam. No ads. Just real deals._\n\nFor feedback, reply to any deal post.`;
    }

    async _sendMessage(chatId, text) {
      try {
        await axios.post(`${this.apiBase}/sendMessage`, {
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
      } catch (error) {
        logger.warn('Failed to send message', { chatId, error: error.message });
      }
    }

    /**
     * Post a growth milestone message when the channel grows.
     */
    async postGrowthMilestoneMessage(memberCount) {
      if (!this.apiBase || !this.channelId) return;

      const milestones = [10, 50, 100, 250, 500, 1000, 5000];
      if (!milestones.includes(memberCount)) return;

      const link = this.channelInviteLink || '';
      const text = `🎉 *We just hit ${memberCount} members!*\n\nThank you for being part of our growing community.\n\nHelp us keep growing:\n👉 Share our channel with friends who love deals!\n${link}\n\n_Together we save more_ 💪`;

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
        logger.warn('Growth milestone message failed', { error: error.message });
      }
    }

    /**
     * Build shareable text for WhatsApp/Telegram groups.
     */
    buildShareableText(deal) {
      const link = this.channelInviteLink || (this.channelUsername ? `https://t.me/${this.channelUsername.replace('@', '')}` : '');
      return `🔥 ${deal.title}\n💰 ₹${deal.discountedPrice} (${deal.discount}% OFF)\n🛍️ ${deal.affiliateLink || deal.productUrl}\n\n📢 More deals like this: ${link}`;
    }

    /**
     * List of Telegram deal communities where posting is welcome.
     * Join these manually and share 1-2 deals per day.
     */
    getTargetCommunities() {
      return [
        { name: 'Online Shopping India', handle: '@onlineshoppingindia', type: 'telegram-group' },
        { name: 'Tech Deals India', handle: '@techdeals_india', type: 'telegram-group' },
        { name: 'Desidime Community', handle: '@desidime_deals', type: 'telegram-group' },
        { name: 'Deals & Coupons India', handle: '@dealsandcouponsindia', type: 'telegram-group' },
        { name: 'Sale & Offers India', handle: '@saleoffersindia', type: 'telegram-group' },
        { name: 'Budget Shopping India', handle: '@budgetshopping_in', type: 'telegram-group' },
        { name: 'Myntra Deals & Offers', handle: '@myntradeals', type: 'telegram-group' },
        { name: 'Beauty & Skincare India', handle: '@beautydeals_india', type: 'telegram-group' }
      ];
    }

    /**
     * Build a formatted message for sharing in deal communities.
     */
    buildCommunityPost(deal, includeChannelPromo = true) {
      const channelRef = this.channelUsername ? `@${this.channelUsername.replace('@', '')}` : '';
      let msg = `🔥 *${deal.title}*\n`;
      msg += `💰 ₹${deal.discountedPrice}  ~~₹${deal.originalPrice}~~  |  *${deal.discount}% OFF*\n`;
      msg += `🛒 ${deal.affiliateLink || deal.productUrl}\n`;

      if (includeChannelPromo && channelRef) {
        msg += `\n_Follow ${channelRef} for more deals_`;
      }

      return msg;
    }
  }

  module.exports = GrowthEngine;
  