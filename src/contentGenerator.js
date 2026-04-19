/**
 * Content Generator Module
 * Generates marketing content for deals
 * Uses HTML parse mode for Telegram (more robust than Markdown)
 */

const logger = require('./logger');

function htmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

class ContentGenerator {
  constructor() {
    this.templates = {
      telegram: this.generateTelegramContent,
      twitter: this.generateTwitterContent,
      email: this.generateEmailContent
    };
  }

  generateContent(deal, platform = 'telegram') {
    try {
      const generator = this.templates[platform];
      if (!generator) {
        logger.warn(`Unknown platform: ${platform}`);
        return null;
      }
      return generator.call(this, deal);
    } catch (error) {
      logger.error(`Error generating content for ${platform}`, { error: error.message });
      return null;
    }
  }

  generateTelegramContent(deal) {
    const discount = deal.discount || 0;
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const triggerLine = this.getPsychologyTrigger(discount, savings, deal.qualityScore || 0);
    const bullets = this.getDecisionBullets(deal);
    const urgency = this.getUrgencyLine(discount, deal.reviews || 0);

    const title = htmlEscape(deal.title);
    const source = htmlEscape(deal.source || 'unknown');
    const link = deal.affiliateLink || deal.productUrl || '';

    let content = `🔥 <b>${title}</b>\n`;
    content += `<i>${htmlEscape(triggerLine)}</i>\n\n`;
    content += `💰 <b>Now:</b> ₹${deal.discountedPrice}   |   <b>MRP:</b> ₹${deal.originalPrice}\n`;
    content += `📉 <b>${discount}% OFF</b>  (You save ₹${savings})\n`;
    content += `⭐ <b>Rating:</b> ${deal.rating || 'N/A'}  |  🧾 <b>Reviews:</b> ${deal.reviews || 'N/A'}\n\n`;
    content += `🧠 <b>Why this is smart:</b>\n${bullets}\n\n`;
    content += `⏳ ${htmlEscape(urgency)}\n\n`;
    content += `🛍️ <b>Buy Here:</b> ${link}\n`;
    content += `\n<i>Source: ${source}</i>`;

    return content;
  }

  generateTwitterContent(deal) {
    const discount = deal.discount || 0;
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const triggerLine = this.getPsychologyTrigger(discount, savings, deal.qualityScore || 0);

    let content = `🔥 ${deal.title}\n`;
    content += `${discount}% OFF | Save ₹${savings}\n`;
    content += `${triggerLine}\n`;
    content += `${this.getUrgencyLine(discount, deal.reviews || 0)}\n`;
    content += `${deal.affiliateLink || deal.productUrl}`;

    if (content.length > 280) {
      content = `${deal.title} | ${discount}% OFF | ₹${deal.discountedPrice}\n${deal.affiliateLink || deal.productUrl}`;
    }

    return content;
  }

  generateEmailContent(deal) {
    const discount = deal.discount || 0;
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const triggerLine = this.getPsychologyTrigger(discount, savings, deal.qualityScore || 0);
    const bullets = this.getDecisionBullets(deal).replace(/\n/g, '<br>');

    let content = `<h2>${deal.title}</h2>\n`;
    content += `<p><em>${triggerLine}</em></p>\n`;
    content += `<p><strong>Now:</strong> ₹${deal.discountedPrice} &nbsp; <strong>MRP:</strong> ₹${deal.originalPrice}</p>\n`;
    content += `<p><strong>Discount:</strong> ${discount}% OFF (Save ₹${savings})</p>\n`;
    content += `<p><strong>Rating:</strong> ${deal.rating || 'N/A'} (${deal.reviews || 'N/A'} reviews)</p>\n`;
    content += `<p><strong>Why this is a high-conviction buy:</strong><br>${bullets}</p>\n`;
    content += `<p>${this.getUrgencyLine(discount, deal.reviews || 0)}</p>\n`;
    content += `<p><a href="${deal.affiliateLink || deal.productUrl}">Buy with affiliate link</a></p>\n`;
    content += `<p><small>Source: ${deal.source}</small></p>`;

    return content;
  }

  getPsychologyTrigger(discount, savings, qualityScore) {
    if (discount >= 60 && qualityScore >= 45) {
      return '⚡ High-velocity offer: deep discount + strong value signals. Typical sell-outs are fast.';
    }
    if (discount >= 45) {
      return `✅ Asymmetric upside: save ₹${savings} while retaining premium-tier value.`;
    }
    if (discount >= 30) {
      return '📈 Rational buy zone: meaningful savings with lower regret risk.';
    }
    return '🧠 Opportunity pick: not extreme discount, but strong utility-per-rupee.';
  }

  getDecisionBullets(deal) {
    const savings = deal.savings || ((deal.originalPrice || 0) - (deal.discountedPrice || 0));
    const bullets = [
      `• <b>Value Anchor:</b> You keep ₹${savings} vs MRP.`,
      `• <b>Risk Signal:</b> Rating ${deal.rating || 'N/A'} from ${deal.reviews || 'N/A'} reviews.`,
      `• <b>Decision Ease:</b> Clear price drop now; no coupon puzzle required.`
    ];
    return bullets.join('\n');
  }

  getUrgencyLine(discount, reviews) {
    if (discount >= 55) {
      return 'Heavy-discount items usually reprice quickly — waiting can erase the edge.';
    }
    if (reviews >= 5000) {
      return 'High-demand SKU with strong social proof. Good deals here do not stay quiet for long.';
    }
    return 'If this matches your need today, locking the current price is typically the better EV move.';
  }

  generateMultipleContent(deals, platform = 'telegram') {
    logger.info(`Generating ${platform} content for ${deals.length} deals`);
    return deals
      .map(deal => this.generateContent(deal, platform))
      .filter(content => content !== null);
  }
}

module.exports = ContentGenerator;
