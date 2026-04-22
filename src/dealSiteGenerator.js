/**
   * Deal Site Generator
   * Generates a static HTML deal listing page and publishes it to GitHub Pages.
   * This gives the bot a permanent public URL indexed by Google — free SEO traffic.
   *
   * The page is pushed to the "gh-pages" branch of your GitHub repo.
   * Enable GitHub Pages in your repo: Settings -> Pages -> Branch: gh-pages -> folder: / (root)
   * Your site will be at: https://YOUR_USERNAME.github.io/deal-bot/
   *
   * Required env vars:
   * - GITHUB_TOKEN: your personal access token (same token used for Actions, already in secrets)
   * - GITHUB_REPO: e.g. "Azil135-sketch/deal-bot"
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

    /**
     * Generate and publish the deal site.
     * @param {Array} deals - processed deals with affiliate links
     * @returns {Promise<Object>}
     */
    async publish(deals) {
      if (!this.enabled) {
        return { success: false, message: 'GitHub token/repo not configured' };
      }
      if (!deals || deals.length === 0) {
        return { success: false, message: 'No deals to publish' };
      }

      try {
        const html = this._generateHTML(deals);
        await this._pushToGitHub('index.html', html, 'Update deal listings - ' + new Date().toISOString().split('T')[0]);

        const siteUrl = 'https://' + this.repo.split('/')[0].toLowerCase() + '.github.io/' + this.repo.split('/')[1];
        logger.info('Deal site published: ' + siteUrl);
        return { success: true, url: siteUrl };
      } catch (error) {
        logger.warn('Deal site generation failed', { error: error.message });
        return { success: false, message: error.message };
      }
    }

    /**
     * Generate complete HTML page with deal cards.
     * @private
     */
    _generateHTML(deals) {
      const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

      const dealCards = deals.map(deal => {
        const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
        const link = deal.affiliateLink || deal.productUrl;
        const img = deal.imageUrl
          ? '<img src="' + deal.imageUrl + '" alt="' + this._escHtml(deal.title) + '" onerror="this.style.display=\'none\'">'
          : '<div class="no-img">🛍️</div>';
        const stars = deal.rating ? '★'.repeat(Math.round(deal.rating)) + '☆'.repeat(5 - Math.round(deal.rating)) : '';

        return '<div class="deal-card">' +
          '<div class="deal-img">' + img + '</div>' +
          '<div class="deal-badge">' + deal.discount + '% OFF</div>' +
          '<div class="deal-body">' +
            '<h3 class="deal-title">' + this._escHtml(deal.title.slice(0, 100)) + '</h3>' +
            (stars ? '<div class="deal-stars">' + stars + ' <span>' + deal.rating + '</span></div>' : '') +
            '<div class="deal-prices">' +
              '<span class="price-now">₹' + deal.discountedPrice + '</span>' +
              '<span class="price-was">₹' + deal.originalPrice + '</span>' +
              '<span class="price-save">Save ₹' + savings + '</span>' +
            '</div>' +
            '<div class="deal-store">' + this._escHtml(deal.source || '') + '</div>' +
            '<a class="deal-btn" href="' + link + '" target="_blank" rel="noopener">Buy Now &rarr;</a>' +
          '</div>' +
        '</div>';
      }).join('\n');

      return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<meta name="description" content="Best deals in India today. Huge discounts on electronics, fashion, beauty and more from Myntra, Nykaa, Ajio, TataCliq and top Indian stores.">\n' +
        '<meta property="og:title" content="Best Deals India — Today\'s Top Discounts">\n' +
        '<meta property="og:description" content="Daily curated deals with up to 70% off from top Indian online stores.">\n' +
        '<title>Best Deals India — Today\'s Top Discounts</title>\n' +
        '<style>\n' +
        ':root{--primary:#6c63ff;--accent:#ff4081;--bg:#f8f9fa;--card:#fff;--text:#1a1a2e;--muted:#666}\n' +
        '*{box-sizing:border-box;margin:0;padding:0}\n' +
        'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);min-height:100vh}\n' +
        'header{background:linear-gradient(135deg,var(--primary),#9c27b0);color:#fff;padding:2rem 1rem;text-align:center}\n' +
        'header h1{font-size:2rem;margin-bottom:.5rem}\n' +
        'header p{opacity:.85;font-size:1rem}\n' +
        '.updated{text-align:center;padding:.75rem;background:#fff;font-size:.85rem;color:var(--muted);border-bottom:1px solid #eee}\n' +
        '.deals-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.5rem;padding:2rem;max-width:1400px;margin:0 auto}\n' +
        '.deal-card{background:var(--card);border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.08);overflow:hidden;position:relative;transition:transform .2s,box-shadow .2s}\n' +
        '.deal-card:hover{transform:translateY(-4px);box-shadow:0 8px 30px rgba(0,0,0,.15)}\n' +
        '.deal-img{height:200px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;overflow:hidden}\n' +
        '.deal-img img{width:100%;height:100%;object-fit:cover}\n' +
        '.no-img{font-size:4rem}\n' +
        '.deal-badge{position:absolute;top:12px;right:12px;background:var(--accent);color:#fff;padding:.3rem .75rem;border-radius:20px;font-weight:700;font-size:.85rem}\n' +
        '.deal-body{padding:1.25rem}\n' +
        '.deal-title{font-size:.95rem;font-weight:600;line-height:1.4;margin-bottom:.75rem;min-height:2.8rem}\n' +
        '.deal-stars{color:#f9a825;font-size:.85rem;margin-bottom:.5rem}\n' +
        '.deal-stars span{color:var(--muted);font-size:.8rem;margin-left:.25rem}\n' +
        '.deal-prices{display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;flex-wrap:wrap}\n' +
        '.price-now{font-size:1.4rem;font-weight:700;color:var(--primary)}\n' +
        '.price-was{text-decoration:line-through;color:var(--muted);font-size:.9rem}\n' +
        '.price-save{background:#e8f5e9;color:#2e7d32;padding:.2rem .5rem;border-radius:8px;font-size:.8rem;font-weight:600}\n' +
        '.deal-store{font-size:.8rem;color:var(--muted);text-transform:capitalize;margin-bottom:.75rem}\n' +
        '.deal-btn{display:block;background:var(--primary);color:#fff;text-align:center;padding:.75rem;border-radius:10px;text-decoration:none;font-weight:600;font-size:.9rem;transition:background .2s}\n' +
        '.deal-btn:hover{background:#5a52d5}\n' +
        'footer{text-align:center;padding:2rem;color:var(--muted);font-size:.85rem;border-top:1px solid #eee;margin-top:2rem}\n' +
        '@media(max-width:600px){header h1{font-size:1.5rem}.deals-grid{padding:1rem;gap:1rem}}\n' +
        '</style>\n</head>\n<body>\n' +
        '<header><h1>🔥 Best Deals India</h1><p>Daily curated deals from top Indian stores — up to 70% OFF</p></header>\n' +
        '<div class="updated">Updated: ' + now + ' IST &nbsp;|&nbsp; ' + deals.length + ' deals today</div>\n' +
        '<div class="deals-grid">\n' + dealCards + '\n</div>\n' +
        '<footer>Deals refresh 4x daily. All links may contain affiliate tracking. Prices subject to change.<br>Subscribe on Telegram for instant alerts.</footer>\n' +
        '</body>\n</html>';
    }

    /**
     * Push/update a file on the gh-pages branch.
     * @private
     */
    async _pushToGitHub(filename, content, commitMessage) {
      const apiUrl = 'https://api.github.com/repos/' + this.repo + '/contents/' + filename;

      // Get current SHA (if file exists on gh-pages)
      let sha = null;
      try {
        const resp = await axios.get(apiUrl + '?ref=' + this.branch, {
          headers: { 'Authorization': 'token ' + this.token, 'User-Agent': 'deal-bot' }
        });
        sha = resp.data.sha;
      } catch {
        // File doesn't exist yet — will create
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

    _escHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  }

  module.exports = DealSiteGenerator;
  