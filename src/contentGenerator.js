/**
 * Content Generator Module
 * Generates marketing content for deals
 */

const logger = require('./logger');

class ContentGenerator {
  constructor() {
    this.templates = {
      telegram: this.generateTelegramContent,
      twitter: this.generateTwitterContent,
      email: this.generateEmailContent
    };
  }

  /**
   * Generate content for a deal
   * @param {Object} deal - Deal object
   * @param {string} platform - Target platform (telegram, twitter, email)
   * @returns {string} - Generated content
   */
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

  /**
   * Generate Telegram content
   * @private
   */
  generateTelegramContent(deal) {
    const discount = deal.discount || 0;
    const savings = deal.originalPrice - deal.discountedPrice;
    const triggerLine = this.getPsychologyTrigger(discount, savings, deal.qualityScore || 0);
    const bullets = this.getDecisionBullets(deal);
    const urgency = this.getUrgencyLine(discount, deal.reviews || 0);

    let content = `🔥 *${deal.title}*\n`;
    content += `_${triggerLine}_\n\n`;
    content += `💰 *Now:* ₹${deal.discountedPrice}   |   *MRP:* ₹${deal.originalPrice}\n`;
    content += `📉 *${discount}% OFF*  (You save ₹${savings})\n`;
    content += `⭐ *Rating:* ${deal.rating || 'N/A'}  |  🧾 *Reviews:* ${deal.reviews || 'N/A'}\n\n`;
    content += `🧠 *Why this is smart:*\n${bullets}\n\n`;
    content += `⏳ ${urgency}\n\n`;
    content += `🛍️ *Buy Here:* ${deal.affiliateLink || deal.productUrl}\n`;
    content += `\n_Source: ${deal.source}_`;

    return content;
  }

  /**
   * Generate Twitter content
   * @private
   */
  generateTwitterContent(deal) {
    const discount = deal.discount || 0;
    const savings = deal.originalPrice - deal.discountedPrice;
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

  /**
   * Generate Email content
   * @private
   */
  generateEmailContent(deal) {
    const discount = deal.discount || 0;
    const savings = deal.originalPrice - deal.discountedPrice;
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

  /**
   * Build psychologically-informed marketing hooks
   * @param {number} discount
   * @param {number} savings
   * @param {number} qualityScore
   * @returns {string}
   */
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

  /**
   * Build concise buying bullets based on conversion psychology
   * @param {Object} deal
   * @returns {string}
   */
  getDecisionBullets(deal) {
    const bullets = [
      `• *Value Anchor:* You keep ₹${deal.savings || (deal.originalPrice - deal.discountedPrice)} vs MRP.`,
      `• *Risk Signal:* Rating ${deal.rating || 'N/A'} from ${deal.reviews || 'N/A'} reviews.`,
      `• *Decision Ease:* Clear price drop now; no coupon puzzle required.`
    ];

    return bullets.join('\n');
  }

  /**
   * Generate urgency line from discount and social-proof depth
   * @param {number} discount
   * @param {number} reviews
   * @returns {string}
   */
  getUrgencyLine(discount, reviews) {
    if (discount >= 55) {
      return 'Heavy-discount items usually reprice quickly — waiting can erase the edge.';
    }

    if (reviews >= 5000) {
      return 'High-demand SKU with strong social proof. Good deals here do not stay quiet for long.';
    }

    return 'If this matches your need today, locking the current price is typically the better EV move.';
  }

  /**
   * Generate content for multiple deals
   * @param {Array} deals - Array of deal objects
   * @param {string} platform - Target platform
   * @returns {Array} - Array of generated content
   */
  generateMultipleContent(deals, platform = 'telegram') {
    logger.info(`Generating ${platform} content for ${deals.length} deals`);

    return deals
      .map(deal => this.generateContent(deal, platform))
      .filter(content => content !== null);
  }
}

// Main execution
async function main() {
  try {
    require('dotenv').config();

    const generator = new ContentGenerator();

    // Example deal for testing
    const exampleDeal = {
      id: 'test-deal-001',
      title: 'Premium Wireless Headphones',
      originalPrice: 5999,
      discountedPrice: 2999,
      discount: 50,
      description: 'High-quality sound with noise cancellation',
      source: 'amazon',
      productUrl: 'https://amazon.in/dp/ASIN',
      affiliateLink: 'https://cuelinks.com/l/xxxxx'
    };

    logger.info('Generating sample content');

    const telegramContent = generator.generateContent(exampleDeal, 'telegram');
    logger.info('Telegram content generated');
    console.log('\n--- TELEGRAM CONTENT ---\n', telegramContent);

    const twitterContent = generator.generateContent(exampleDeal, 'twitter');
    logger.info('Twitter content generated');
    console.log('\n--- TWITTER CONTENT ---\n', twitterContent);

    const emailContent = generator.generateContent(exampleDeal, 'email');
    logger.info('Email content generated');
    console.log('\n--- EMAIL CONTENT ---\n', emailContent);
  } catch (error) {
    logger.error('Fatal error in content generation', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ContentGenerator;
