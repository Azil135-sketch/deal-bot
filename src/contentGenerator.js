/**
 * Content Generator
 * Writes deal posts that sound like a real person sharing a find,
 * not a marketing bot running through a checklist.
 *
 * Rules:
 * - No "Value Anchor:", "Risk Signal:", "Decision Ease:" labels
 * - No "High-velocity offer" / "asymmetric upside" / "better EV move" phrasing
 * - No psychological manipulation framing
 * - Short, specific, honest — like a friend texting you about a deal they found
 */

const logger = require('./logger');

function e(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Store display names
const STORE_DISPLAY = {
  myntra: 'Myntra', ajio: 'Ajio', nykaa: 'Nykaa', amazon: 'Amazon',
  flipkart: 'Flipkart', tatacliq: 'TataCliq', meesho: 'Meesho',
  croma: 'Croma', healthkart: 'Healthkart', netmeds: 'Netmeds',
  pharmeasy: 'PharmEasy', '1mg': '1mg', tata1mg: '1mg',
  snapdeal: 'Snapdeal', bewakoof: 'Bewakoof', firstcry: 'FirstCry',
  pepperfry: 'Pepperfry', lenskart: 'Lenskart'
};

function storeName(deal) {
  const raw = (deal.source || deal._storeRaw || '').toLowerCase();
  for (const [key, display] of Object.entries(STORE_DISPLAY)) {
    if (raw.includes(key)) return display;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1) || 'Store';
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
      if (!generator) return null;
      return generator.call(this, deal);
    } catch (error) {
      logger.error(`Content generation error for ${platform}`, { error: error.message });
      return null;
    }
  }

  generateTelegramContent(deal) {
    const discount = deal.discount || 0;
    const discountedPrice = deal.discountedPrice || 0;
    const originalPrice = deal.originalPrice || 0;
    const savings = originalPrice - discountedPrice;
    const store = storeName(deal);
    const link = deal.affiliateLink || deal.productUrl || '';
    const isSearchLink = deal._isSearchUrl === true;

    let msg = '';

    // Title line — clean, no emoji overload
    msg += `<b>${e(deal.title)}</b>\n\n`;

    // Price block — just the facts
    if (discountedPrice > 0) {
      msg += `₹${discountedPrice}`;
      if (originalPrice > discountedPrice) {
        msg += ` <s>₹${originalPrice}</s>`;
      }
      if (discount > 0) {
        msg += ` — <b>${discount}% off</b>`;
      }
      if (savings > 100) {
        msg += ` (₹${savings} less than usual)`;
      }
      msg += `\n`;
    } else if (discount > 0) {
      msg += `<b>${discount}% off</b> on ${e(store)}\n`;
    }

    // Rating — only if we have real data
    if (deal.rating && deal.reviews) {
      msg += `${deal.rating}★ from ${this._formatNum(deal.reviews)} reviews\n`;
    } else if (deal.rating) {
      msg += `${deal.rating}★ rated\n`;
    }

    msg += `\n`;

    // One honest, specific reason to care — no template labels
    const note = this._getDealNote(deal, store);
    if (note) {
      msg += `${e(note)}\n\n`;
    }

    // Price drop indicator (from priceTracker)
    if (deal._priceDrop) {
      msg += `📉 <b>Price Drop Alert</b>: ${deal._priceDropPct}% below its 7-day average.\n\n`;
    }

    // CTA — direct and clear
    if (isSearchLink) {
      msg += `<a href="${link}">Find it on ${e(store)} →</a>`;
    } else {
      msg += `<a href="${link}">Buy on ${e(store)} →</a>`;
    }

    return msg;
  }

  generateTwitterContent(deal) {
    const discount = deal.discount || 0;
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = storeName(deal);
    const link = deal.affiliateLink || deal.productUrl || '';

    let msg = `${deal.title} — ${discount}% off`;
    if (savings > 0) msg += `, save ₹${savings}`;
    msg += `\n${store}: ₹${deal.discountedPrice}`;
    if (deal.rating) msg += ` | ${deal.rating}★`;
    msg += `\n${link}`;

    if (msg.length > 280) {
      msg = `${deal.title} | ${discount}% OFF | ₹${deal.discountedPrice}\n${link}`;
    }
    return msg;
  }

  generateEmailContent(deal) {
    const discount = deal.discount || 0;
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = storeName(deal);
    const note = this._getDealNote(deal, store);

    let content = `<h2>${deal.title}</h2>\n`;
    content += `<p>₹${deal.discountedPrice} <del>₹${deal.originalPrice}</del> — ${discount}% off on ${store}</p>\n`;
    if (savings > 0) content += `<p>Saving ₹${savings}</p>\n`;
    if (deal.rating) content += `<p>${deal.rating}★ rated (${deal.reviews || 'N/A'} reviews)</p>\n`;
    if (note) content += `<p>${note}</p>\n`;
    content += `<p><a href="${deal.affiliateLink || deal.productUrl}">View on ${store}</a></p>`;
    return content;
  }

  /**
   * Write one specific, honest reason this deal is worth clicking.
   * No labels. No hype. No template sentences.
   */
  _getDealNote(deal, store) {
    const discount = deal.discount || 0;
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const price = deal.discountedPrice || 0;
    const reviews = deal.reviews || 0;
    const rating = parseFloat(deal.rating) || 0;

    // Pick the single most relevant fact and write it naturally
    if (rating >= 4.3 && reviews >= 10000) {
      return `${this._formatNum(reviews)} people rated it ${rating}★ — not a random product.`;
    }
    if (savings >= 2000) {
      return `₹${savings} off is more than most people save in a week of deal hunting.`;
    }
    if (discount >= 70) {
      return `At ${discount}% off this is a clearance-level price, not a routine sale.`;
    }
    if (price <= 299 && discount >= 50) {
      return `Under ₹300 for something that was ₹${deal.originalPrice} is worth a look.`;
    }
    if (price > 0 && price <= 500 && discount >= 40) {
      return `Well under ₹500. Easy return on any online order that needs a top-up.`;
    }
    if (savings >= 500 && discount >= 40) {
      return `₹${savings} saving at ${discount}% off — one of the better ones to come through today.`;
    }
    if (rating >= 4.0 && reviews >= 1000) {
      return `${deal.rating}★ from ${this._formatNum(reviews)} ratings — reviewed enough to trust.`;
    }
    if (store === 'Healthkart' || store === 'Netmeds' || store === 'PharmEasy' || store === '1mg') {
      return `Health products at this discount are usually limited to overstocked sizes — check if yours is available.`;
    }
    if (store === 'Nykaa') {
      return `Nykaa rarely runs this deep on skincare/beauty without a coupon catch. Straightforward price here.`;
    }
    if (discount >= 50) {
      return `${discount}% off with no coupon code required.`;
    }
    return null;
  }

  _formatNum(n) {
    if (!n) return '0';
    const num = parseInt(n);
    if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return String(num);
  }

  generateMultipleContent(deals, platform = 'telegram') {
    return deals
      .map(deal => this.generateContent(deal, platform))
      .filter(content => content !== null);
  }
}

module.exports = ContentGenerator;
