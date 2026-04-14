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

    let content = `🔥 *${deal.title}*\n\n`;
    content += `💰 *Price:* ₹${deal.discountedPrice} (was ₹${deal.originalPrice})\n`;
    content += `📉 *Discount:* ${discount}% OFF (Save ₹${savings})\n\n`;
    content += `📝 ${deal.description}\n\n`;
    content += `🛍️ [Shop Now](${deal.affiliateLink || deal.productUrl})\n`;
    content += `\n_Source: ${deal.source}_`;

    return content;
  }

  /**
   * Generate Twitter content
   * @private
   */
  generateTwitterContent(deal) {
    const discount = deal.discount || 0;

    let content = `🔥 ${deal.title}\n\n`;
    content += `💰 ₹${deal.discountedPrice} (was ₹${deal.originalPrice})\n`;
    content += `📉 ${discount}% OFF\n\n`;
    content += `${deal.affiliateLink || deal.productUrl}`;

    // Twitter has character limits, truncate if needed
    if (content.length > 280) {
      content = content.substring(0, 270) + '...';
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

    let content = `<h2>${deal.title}</h2>\n`;
    content += `<p>${deal.description}</p>\n`;
    content += `<p><strong>Price:</strong> ₹${deal.discountedPrice} (was ₹${deal.originalPrice})</p>\n`;
    content += `<p><strong>Discount:</strong> ${discount}% OFF (Save ₹${savings})</p>\n`;
    content += `<p><a href="${deal.affiliateLink || deal.productUrl}">Shop Now</a></p>\n`;
    content += `<p><small>Source: ${deal.source}</small></p>`;

    return content;
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
