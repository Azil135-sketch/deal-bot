/**
 * Referral Tracker v4.1
 * 
 * Tracks Telegram channel growth via Bot API getChatMemberCount.
 * Stores subscriber history to detect growth velocity and automate
 * milestone rewards / engagement boosts.
 * 
 * Also generates invite links with UTM-like tracking for external sharing.
 * 
 * Storage: data/subscriber_history.json
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');

const HISTORY_FILE = path.join(__dirname, '../data/subscriber_history.json');
const MAX_HISTORY_ENTRIES = 60; // 60 data points = ~10 days at 6x daily

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return { entries: [], milestonesHit: [] };
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return { entries: [], milestonesHit: [] };
  }
}

function saveHistory(data) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    logger.warn('Failed to save subscriber history', { error: error.message });
  }
}

class ReferralTracker {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.channelId = process.env.TELEGRAM_CHAT_ID;
    this.channelUsername = process.env.TELEGRAM_CHANNEL_USERNAME || '';
    this.channelInviteLink = process.env.TELEGRAM_CHANNEL_INVITE_LINK || '';
    this.apiBase = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;
  }

  /**
   * Get current subscriber count and record it.
   * Returns { count, growthVelocity (members per day), isNewMilestone }
   */
  async recordSubscriberCount() {
    if (!this.apiBase || !this.channelId) {
      return { count: 0, growthVelocity: 0, isNewMilestone: false };
    }

    try {
      const resp = await axios.post(`${this.apiBase}/getChatMemberCount`, {
        chat_id: this.channelId
      });
      const count = resp.data?.result || 0;

      const history = loadHistory();
      const now = Date.now();

      history.entries.push({ count, timestamp: now });
      if (history.entries.length > MAX_HISTORY_ENTRIES) {
        history.entries = history.entries.slice(-MAX_HISTORY_ENTRIES);
      }

      // Calculate growth velocity (members per day based on last 7 data points)
      let growthVelocity = 0;
      if (history.entries.length >= 2) {
        const recent = history.entries.slice(-7);
        const first = recent[0];
        const last = recent[recent.length - 1];
        const days = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24);
        if (days > 0) {
          growthVelocity = Math.round((last.count - first.count) / days);
        }
      }

      // Check milestones
      const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
      let isNewMilestone = false;
      for (const m of milestones) {
        if (count >= m && !history.milestonesHit.includes(m)) {
          history.milestonesHit.push(m);
          isNewMilestone = true;
          logger.info(`🎉 Milestone reached: ${m} subscribers!`);
        }
      }

      saveHistory(history);
      return { count, growthVelocity, isNewMilestone };
    } catch (error) {
      logger.debug('Failed to get subscriber count', { error: error.message });
      return { count: 0, growthVelocity: 0, isNewMilestone: false };
    }
  }

  /**
   * Get the latest recorded subscriber count without API call.
   */
  getLatestCount() {
    const history = loadHistory();
    if (history.entries.length === 0) return 0;
    return history.entries[history.entries.length - 1].count;
  }

  /**
   * Generate a tracked invite link for a specific platform.
   * This lets you see which platform drives the most subscribers.
   */
  getTrackedInviteLink(platform = 'general') {
    const base = this.channelInviteLink || (this.channelUsername ? `https://t.me/${this.channelUsername.replace('@', '')}` : '');
    if (!base) return '';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}start=ref_${platform}`;
  }

  /**
   * Get shareable links for all major platforms with tracking.
   */
  getAllTrackedLinks() {
    return {
      telegram: this.getTrackedInviteLink('telegram'),
      whatsapp: this.getTrackedInviteLink('whatsapp'),
      reddit: this.getTrackedInviteLink('reddit'),
      discord: this.getTrackedInviteLink('discord'),
      facebook: this.getTrackedInviteLink('facebook'),
      twitter: this.getTrackedInviteLink('twitter'),
      quora: this.getTrackedInviteLink('quora'),
      direct: this.getTrackedInviteLink('direct')
    };
  }
}

module.exports = ReferralTracker;
