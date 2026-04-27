/**
 * Social Share Generator v4.1
 * Generates copy-paste ready content for EVERY zero-cost distribution channel.
 * 
 * Platforms covered:
 * - Reddit (titles + body text)
 * - WhatsApp (broadcast messages)
 * - Quora (deal answer format)
 * - Facebook Groups (post text)
 * - Pinterest Rich Pin description
 * - Blogger / Medium (HTML post)
 * - Email Newsletter (HTML)
 * - Twitter/X (tweet text)
 */

const logger = require('./logger');

const STORE_DISPLAY = {
  myntra: 'Myntra', ajio: 'Ajio', nykaa: 'Nykaa', amazon: 'Amazon',
  flipkart: 'Flipkart', tatacliq: 'TataCliq', meesho: 'Meesho',
  croma: 'Croma', healthkart: 'Healthkart', netmeds: 'Netmeds',
  pharmeasy: 'PharmEasy', '1mg': '1mg', tata1mg: '1mg',
  snapdeal: 'Snapdeal', bewakoof: 'Bewakoof', firstcry: 'FirstCry',
  pepperfry: 'Pepperfry', lenskart: 'Lenskart'
};

function storeName(deal) {
  const raw = (deal.source || '').toLowerCase();
  for (const [key, display] of Object.entries(STORE_DISPLAY)) {
    if (raw.includes(key)) return display;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1) || 'Store';
}

function formatNum(n) {
  if (!n) return '0';
  const num = parseInt(n);
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return String(num);
}

class SocialShareGenerator {
  /**
   * Reddit post: title + body comment
   */
  redditPost(deal) {
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = storeName(deal);
    const title = `[${store}] ${deal.title.slice(0, 100)} — ${deal.discount}% OFF, ₹${deal.discountedPrice} (Save ₹${savings})`;
    const body = `
Found this deal on ${store}:

**${deal.title}**
Price: ₹${deal.discountedPrice} (was ₹${deal.originalPrice})
Discount: ${deal.discount}% OFF
You Save: ₹${savings}

Link: ${deal.affiliateLink || deal.productUrl}

Happy shopping! 🛍️
    `.trim();
    return { title, body };
  }

  /**
   * WhatsApp broadcast message
   */
  whatsappBroadcast(deal, channelLink = '') {
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = storeName(deal);
    let msg = `🔥 *${deal.title}*\n\n`;
    msg += `💰 *₹${deal.discountedPrice}* (was ₹${deal.originalPrice})\n`;
    msg += `📉 *${deal.discount}% OFF* — Save ₹${savings}\n`;
    msg += `🛍️ ${store}\n\n`;
    msg += `${deal.affiliateLink || deal.productUrl}\n\n`;
    if (deal.rating) {
      msg += `⭐ ${deal.rating}/5 from ${formatNum(deal.reviews)} reviews\n\n`;
    }
    if (channelLink) {
      msg += `📢 More deals: ${channelLink}`;
    }
    return msg;
  }

  /**
   * Quora answer format (for "Where can I find deals on X?" questions)
   */
  quoraAnswer(deal) {
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = storeName(deal);
    return `
I found a solid deal on ${store} right now:

${deal.title}

Price dropped from ₹${deal.originalPrice} to ₹${deal.discountedPrice} — that's ${deal.discount}% off (save ₹${savings}).

${deal.rating ? `It's rated ${deal.rating}★ by ${formatNum(deal.reviews)} people, so it's not some unknown product.` : ''}

Here's the direct link: ${deal.affiliateLink || deal.productUrl}

If you're looking for similar deals, I run a small Telegram channel where I post hand-picked deals daily — no spam, only real discounts. Let me know if you want the link.
    `.trim();
  }

  /**
   * Facebook Group post
   */
  facebookPost(deal) {
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = storeName(deal);
    return `
🔥 DEAL ALERT

${deal.title}

💰 ₹${deal.discountedPrice} (was ₹${deal.originalPrice})
📉 ${deal.discount}% OFF
💵 Save ₹${savings}
🛍️ ${store}

👉 ${deal.affiliateLink || deal.productUrl}

Like & Share if this helped you save money! 👍
    `.trim();
  }

  /**
   * Pinterest Rich Pin description
   */
  pinterestPin(deal) {
    const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
    const store = storeName(deal);
    return `${deal.title} — ${deal.discount}% OFF on ${store}. Now ₹${deal.discountedPrice} (save ₹${savings}). Shop the deal before it ends!`;
  }

  /**
   * Blogger / Medium HTML post
   */
  blogPostHtml(deals) {
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    let html = `<h2>Best Deals India — ${date}</h2>\n`;
    html += `<p>Hand-picked deals from Myntra, Nykaa, Ajio and more. Verified before posting.</p>\n`;
    html += `<hr>\n`;

    for (const deal of deals.slice(0, 5)) {
      const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
      const store = storeName(deal);
      html += `<h3>${deal.title}</h3>\n`;
      html += `<p><strong>Price:</strong> ₹${deal.discountedPrice} <del>₹${deal.originalPrice}</del></p>\n`;
      html += `<p><strong>Discount:</strong> ${deal.discount}% OFF (Save ₹${savings})</p>\n`;
      html += `<p><strong>Store:</strong> ${store}</p>\n`;
      if (deal.rating) {
        html += `<p><strong>Rating:</strong> ${deal.rating}★ (${formatNum(deal.reviews)} reviews)</p>\n`;
      }
      html += `<p><a href="${deal.affiliateLink || deal.productUrl}" target="_blank" rel="noopener">👉 Buy Now on ${store}</a></p>\n`;
      html += `<hr>\n`;
    }

    html += `<p><em>Prices and availability are subject to change. Deals are verified at time of posting.</em></p>`;
    return html;
  }

  /**
   * Email newsletter HTML
   */
  newsletterHtml(deals, channelLink = '') {
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Deal Alert — ${date}</title></head><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">`;
    html += `<h1 style="color:#333;">🔥 Top Deals — ${date}</h1>`;
    html += `<p style="color:#666;">Real deals, verified stock, no fluff.</p>`;

    for (const deal of deals.slice(0, 5)) {
      const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
      const store = storeName(deal);
      html += `<div style="border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;">`;
      html += `<h3 style="margin-top:0;color:#222;">${deal.title}</h3>`;
      html += `<p style="font-size:18px;font-weight:bold;color:#e91e63;margin:4px 0;">₹${deal.discountedPrice} <span style="font-size:14px;color:#999;text-decoration:line-through;font-weight:normal;">₹${deal.originalPrice}</span></p>`;
      html += `<p style="color:#4caf50;font-weight:bold;margin:4px 0;">${deal.discount}% OFF — Save ₹${savings}</p>`;
      html += `<p style="color:#666;margin:4px 0;">🛍️ ${store}</p>`;
      if (deal.rating) {
        html += `<p style="color:#666;margin:4px 0;">⭐ ${deal.rating}/5 (${formatNum(deal.reviews)} reviews)</p>`;
      }
      html += `<a href="${deal.affiliateLink || deal.productUrl}" style="display:inline-block;background:#6c63ff;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold;margin-top:8px;">Buy Now →</a>`;
      html += `</div>`;
    }

    if (channelLink) {
      html += `<p style="text-align:center;color:#666;margin-top:24px;">Get instant deal alerts on <a href="${channelLink}">Telegram</a></p>`;
    }
    html += `<p style="text-align:center;color:#999;font-size:12px;margin-top:24px;">You received this because you subscribed to deal alerts.<br>Links may contain affiliate tracking.</p>`;
    html += `</body></html>`;
    return html;
  }

  /**
   * Twitter/X tweet (max 280 chars)
   */
  twitterTweet(deal) {
    const store = storeName(deal);
    let tweet = `🔥 ${deal.title.slice(0, 70)}\n`;
    tweet += `💰 ₹${deal.discountedPrice} (${deal.discount}% OFF)\n`;
    tweet += `${deal.affiliateLink || deal.productUrl}`;
    if (tweet.length > 280) {
      tweet = `🔥 ${deal.title.slice(0, 50)} | ${deal.discount}% OFF | ₹${deal.discountedPrice}\n`;
      tweet += `${deal.affiliateLink || deal.productUrl}`;
    }
    return tweet;
  }

  /**
   * Generate a "Daily Deal Roundup" text for manual posting anywhere.
   */
  dailyRoundup(deals, channelLink = '') {
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    let text = `📅 *Deal Roundup — ${date}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    deals.slice(0, 5).forEach((deal, i) => {
      const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
      const store = storeName(deal);
      text += `${i + 1}. *${deal.title.slice(0, 60)}*\n`;
      text += `   ₹${deal.discountedPrice} (was ₹${deal.originalPrice}) | ${deal.discount}% OFF | ${store}\n`;
      text += `   ${deal.affiliateLink || deal.productUrl}\n\n`;
    });

    if (channelLink) {
      text += `📢 More deals: ${channelLink}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━`;
    return text;
  }
}

module.exports = SocialShareGenerator;
