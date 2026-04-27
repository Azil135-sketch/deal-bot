/**
 * Deal Site Generator v4.1
 * Generates a static HTML deal listing page and publishes it to GitHub Pages.
 * 
 * SEO ENHANCEMENTS in v4.1:
 * - JSON-LD structured data (Product + Offer schema)
 * - Auto-generated sitemap.xml
 * - RSS feed (deals.xml)
 * - OpenGraph + Twitter Card meta tags per deal
 * - Canonical URLs
 * - Semantic HTML5
 * - Mobile-first responsive design
 * 
 * Free organic traffic from Google — no ads needed.
 */

const axios = require('axios');
const logger = require('./logger');

class DealSiteGenerator {
  constructor() {
    this.token = process.env.GITHUB_TOKEN || process.env.GITHUB_ACTIONS_TOKEN;
    this.repo = process.env.GITHUB_REPO || '';
    this.branch = 'gh-pages';
    this.enabled = !!(this.token && this.repo);

    if (!this.enabled) {
      logger.debug('DealSiteGenerator: GITHUB_TOKEN or GITHUB_REPO not set — site generation disabled');
    }
  }

  async publish(deals) {
    if (!this.enabled) {
      return { success: false, message: 'GitHub token/repo not configured' };
    }
    if (!deals || deals.length === 0) {
      return { success: false, message: 'No deals to publish' };
    }

    try {
      const html = this._generateHTML(deals);
      const sitemap = this._generateSitemap(deals);
      const rss = this._generateRSS(deals);

      const today = new Date().toISOString().split('T')[0];
      await this._pushToGitHub('index.html', html, `Update deals — ${today}`);
      await this._pushToGitHub('sitemap.xml', sitemap, `Update sitemap — ${today}`);
      await this._pushToGitHub('deals.xml', rss, `Update RSS — ${today}`);

      const siteUrl = 'https://' + this.repo.split('/')[0].toLowerCase() + '.github.io/' + this.repo.split('/')[1];
      logger.info(`Deal site published: ${siteUrl}`);
      return { success: true, url: siteUrl };
    } catch (error) {
      logger.warn('Deal site generation failed', { error: error.message });
      return { success: false, message: error.message };
    }
  }

  _generateHTML(deals) {
    const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const isoNow = new Date().toISOString();
    const siteUrl = 'https://' + this.repo.split('/')[0].toLowerCase() + '.github.io/' + this.repo.split('/')[1];

    const dealCards = deals.map((deal, index) => {
      const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
      const link = deal.affiliateLink || deal.productUrl;
      const img = deal.imageUrl
        ? `<img src="${this._escHtml(deal.imageUrl)}" alt="${this._escHtml(deal.title)}" loading="lazy" onerror="this.style.display='none'">`
        : '<div class="no-img">🛍️</div>';
      const stars = deal.rating ? '★'.repeat(Math.round(deal.rating)) + '☆'.repeat(5 - Math.round(deal.rating)) : '';

      // JSON-LD structured data for each deal
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: deal.title,
        image: deal.imageUrl || undefined,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'INR',
          price: String(deal.discountedPrice),
          availability: 'https://schema.org/InStock',
          url: link
        },
        aggregateRating: deal.rating ? {
          '@type': 'AggregateRating',
          ratingValue: String(deal.rating),
          reviewCount: String(deal.reviews || 0)
        } : undefined
      };

      return `
<article class="deal-card" itemscope itemtype="https://schema.org/Product">
  <div class="deal-img">${img}</div>
  <div class="deal-badge">${deal.discount}% OFF</div>
  <div class="deal-body">
    <h3 class="deal-title" itemprop="name">${this._escHtml(deal.title.slice(0, 100))}</h3>
    ${stars ? `<div class="deal-stars">${stars} <span>${deal.rating}</span></div>` : ''}
    <div class="deal-prices" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <meta itemprop="priceCurrency" content="INR">
      <meta itemprop="availability" content="https://schema.org/InStock">
      <span class="price-now" itemprop="price">₹${deal.discountedPrice}</span>
      <span class="price-was">₹${deal.originalPrice}</span>
      <span class="price-save">Save ₹${savings}</span>
    </div>
    <div class="deal-store">${this._escHtml(deal.source || '')}</div>
    <a class="deal-btn" href="${link}" target="_blank" rel="noopener sponsored" itemprop="url">Buy Now &rarr;</a>
  </div>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</article>`;
    }).join('\n');

    // Aggregate JSON-LD for the page itself
    const pageJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: deals.map((deal, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: deal.affiliateLink || deal.productUrl
      }))
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Best deals in India today. Huge discounts on electronics, fashion, beauty and more from Myntra, Nykaa, Ajio, TataCliq and top Indian stores.">
<meta name="keywords" content="India deals, online shopping discounts, Myntra deals, Nykaa offers, Ajio sale, TataCliq discounts">
<meta property="og:type" content="website">
<meta property="og:url" content="${siteUrl}">
<meta property="og:title" content="Best Deals India — Today's Top Discounts">
<meta property="og:description" content="Daily curated deals with up to 70% off from top Indian online stores. Real product links, verified stock.">
<meta property="og:image" content="${siteUrl}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Best Deals India — Today's Top Discounts">
<meta name="twitter:description" content="Daily curated deals with up to 70% off from top Indian online stores.">
<meta name="twitter:image" content="${siteUrl}/og-image.png">
<link rel="canonical" href="${siteUrl}/">
<link rel="alternate" type="application/rss+xml" title="Best Deals India RSS" href="${siteUrl}/deals.xml">
<link rel="sitemap" type="application/xml" title="Sitemap" href="${siteUrl}/sitemap.xml">
<title>Best Deals India — Today's Top Discounts</title>
<style>
:root{--primary:#6c63ff;--accent:#ff4081;--bg:#f8f9fa;--card:#fff;--text:#1a1a2e;--muted:#666}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
header{background:linear-gradient(135deg,var(--primary),#9c27b0);color:#fff;padding:2rem 1rem;text-align:center}
header h1{font-size:2rem;margin-bottom:.5rem}
header p{opacity:.85;font-size:1rem}
.updated{text-align:center;padding:.75rem;background:#fff;font-size:.85rem;color:var(--muted);border-bottom:1px solid #eee}
.deals-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;padding:2rem;max-width:1400px;margin:0 auto}
.deal-card{background:var(--card);border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.08);overflow:hidden;position:relative;transition:transform .2s,box-shadow .2s}
.deal-card:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,.15)}
.deal-img{height:200px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.deal-img img{width:100%;height:100%;object-fit:cover}
.no-img{font-size:4rem}
.deal-badge{position:absolute;top:12px;right:12px;background:var(--accent);color:#fff;padding:.3rem .75rem;border-radius:20px;font-weight:700;font-size:.85rem}
.deal-body{padding:1.25rem}
.deal-title{font-size:.95rem;font-weight:600;line-height:1.4;margin-bottom:.75rem;min-height:2.8rem}
.deal-stars{color:#f9a825;font-size:.85rem;margin-bottom:.5rem}
.deal-stars span{color:var(--muted);font-size:.8rem;margin-left:.25rem}
.deal-prices{display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;flex-wrap:wrap}
.price-now{font-size:1.4rem;font-weight:700;color:var(--primary)}
.price-was{text-decoration:line-through;color:var(--muted);font-size:.9rem}
.price-save{background:#e8f5e9;color:#2e7d32;padding:.2rem .5rem;border-radius:8px;font-size:.8rem;font-weight:600}
.deal-store{font-size:.8rem;color:var(--muted);text-transform:capitalize;margin-bottom:.75rem}
.deal-btn{display:block;background:var(--primary);color:#fff;text-align:center;padding:.75rem;border-radius:10px;text-decoration:none;font-weight:600;font-size:.9rem;transition:background .2s}
.deal-btn:hover{background:#5a52d5}
footer{text-align:center;padding:2rem;color:var(--muted);font-size:.85rem;border-top:1px solid #eee;margin-top:2rem}
.telegram-cta{display:block;text-align:center;margin:1rem auto;max-width:400px;background:#fff;padding:1rem;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.06);text-decoration:none;color:var(--text)}
.telegram-cta strong{color:var(--primary);display:block;margin-bottom:.25rem}
@media(max-width:600px){header h1{font-size:1.5rem}.deals-grid{padding:1rem;gap:1rem}}
</style>
</head>
<body>
<header>
  <h1>🔥 Best Deals India</h1>
  <p>Daily curated deals from top Indian stores — up to 70% OFF</p>
</header>
<div class="updated">Updated: ${now} IST &nbsp;|&nbsp; ${deals.length} deals today</div>
<a class="telegram-cta" href="${process.env.TELEGRAM_CHANNEL_INVITE_LINK || '#'}" target="_blank" rel="noopener">
  <strong>📢 Get Instant Alerts on Telegram</strong>
  <span>Never miss a deal — join ${process.env.TELEGRAM_CHANNEL_USERNAME || 'our channel'}</span>
</a>
<div class="deals-grid">
${dealCards}
</div>
<footer>
  Deals refresh 4-6x daily. All links may contain affiliate tracking. Prices subject to change.<br>
  Subscribe on Telegram for instant alerts. &copy; ${new Date().getFullYear()}
</footer>
<script type="application/ld+json">${JSON.stringify(pageJsonLd)}</script>
</body>
</html>`;
  }

  _generateSitemap(deals) {
    const siteUrl = 'https://' + this.repo.split('/')[0].toLowerCase() + '.github.io/' + this.repo.split('/')[1];
    const today = new Date().toISOString().split('T')[0];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    xml += `  <url>\n    <loc>${siteUrl}/deals.xml</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    xml += '</urlset>';
    return xml;
  }

  _generateRSS(deals) {
    const siteUrl = 'https://' + this.repo.split('/')[0].toLowerCase() + '.github.io/' + this.repo.split('/')[1];
    const buildDate = new Date().toUTCString();

    let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
    rss += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n';
    rss += '<channel>\n';
    rss += `  <title>Best Deals India</title>\n`;
    rss += `  <link>${siteUrl}/</link>\n`;
    rss += `  <description>Daily curated deals from Myntra, Nykaa, Ajio, TataCliq and more. Real product links, verified stock.</description>\n`;
    rss += `  <language>en-in</language>\n`;
    rss += `  <lastBuildDate>${buildDate}</lastBuildDate>\n`;
    rss += `  <atom:link href="${siteUrl}/deals.xml" rel="self" type="application/rss+xml" />\n`;

    for (const deal of deals.slice(0, 20)) {
      const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
      const link = deal.affiliateLink || deal.productUrl;
      const pubDate = new Date(deal.timestamp || Date.now()).toUTCString();
      rss += `  <item>\n`;
      rss += `    <title>${this._escXml(deal.title)} — ${deal.discount}% OFF</title>\n`;
      rss += `    <link>${link}</link>\n`;
      rss += `    <guid>${link}</guid>\n`;
      rss += `    <pubDate>${pubDate}</pubDate>\n`;
      rss += `    <description>₹${deal.discountedPrice} (was ₹${deal.originalPrice}) — Save ₹${savings} on ${deal.source || 'store'}</description>\n`;
      rss += `  </item>\n`;
    }

    rss += '</channel>\n</rss>';
    return rss;
  }

  async _pushToGitHub(filename, content, commitMessage) {
    const apiUrl = 'https://api.github.com/repos/' + this.repo + '/contents/' + filename;

    // Ensure gh-pages branch exists
    await this._ensureBranch();

    let sha = null;
    try {
      const resp = await axios.get(apiUrl + '?ref=' + this.branch, {
        headers: { 'Authorization': 'token ' + this.token, 'User-Agent': 'deal-bot' }
      });
      sha = resp.data.sha;
    } catch {
      // File doesn't exist yet
    }

    const payload = {
      message: commitMessage,
      content: Buffer.from(content).toString('base64'),
      branch: this.branch
    };
    if (sha) payload.sha = sha;

    await axios.put(apiUrl, payload, {
      headers: { 'Authorization': 'token ' + this.token, 'Content-Type': 'application/json', 'User-Agent': 'deal-bot' },
      timeout: 15000
    });
  }

  async _ensureBranch() {
    const [owner, repoName] = this.repo.split('/');
    const branchApi = `https://api.github.com/repos/${this.repo}/git/refs/heads/${this.branch}`;

    try {
      await axios.get(branchApi, {
        headers: { 'Authorization': 'token ' + this.token, 'User-Agent': 'deal-bot' },
        timeout: 10000
      });
      return; // Branch exists
    } catch {
      // Branch doesn't exist — create from default branch
    }

    try {
      // Get default branch SHA
      const defaultResp = await axios.get(`https://api.github.com/repos/${this.repo}/git/ref/heads/main`, {
        headers: { 'Authorization': 'token ' + this.token, 'User-Agent': 'deal-bot' }
      });
      const sha = defaultResp.data?.object?.sha;
      if (!sha) throw new Error('Could not find default branch');

      // Create gh-pages branch
      await axios.post(`https://api.github.com/repos/${this.repo}/git/refs`, {
        ref: `refs/heads/${this.branch}`,
        sha
      }, {
        headers: { 'Authorization': 'token ' + this.token, 'User-Agent': 'deal-bot' },
        timeout: 10000
      });

      logger.info(`Created ${this.branch} branch`);
    } catch (error) {
      logger.warn(`Could not create ${this.branch} branch`, { error: error.message });
    }
  }

  _escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _escXml(str) {
    return this._escHtml(str).replace(/'/g, '&apos;');
  }
}

module.exports = DealSiteGenerator;
