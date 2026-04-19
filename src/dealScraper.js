/**
 * Deal Scraper Module
 * Fetches real deals from free public sources:
 * - Desidime RSS (Indian deal community, no API key required)
 * - Mydala RSS feed
 * - Direct product page scraping for known deal pages
 */

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('./logger');

const SCRAPE_TIMEOUT = 15000;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

class DealScraper {
  constructor() {
    this.client = axios.create({
      timeout: SCRAPE_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });
  }

  /**
   * Scrape deals from all public sources
   * @returns {Promise<Array>}
   */
  async scrapeAll() {
    const results = await Promise.allSettled([
      this.scrapeDesidime(),
      this.scrapeMydala(),
      this.scrapeGrabOn()
    ]);

    const deals = [];
    results.forEach((result, i) => {
      const sources = ['desidime', 'mydala', 'grabon'];
      if (result.status === 'fulfilled') {
        logger.info(`${sources[i]}: got ${result.value.length} deals`);
        deals.push(...result.value);
      } else {
        logger.warn(`${sources[i]} scrape failed: ${result.reason?.message}`);
      }
    });

    return deals;
  }

  /**
   * Scrape Desidime hot deals (India's largest deal community)
   */
  async scrapeDesidime() {
    try {
      const resp = await this.client.get('https://www.desidime.com/hot_deals/page/1', {
        headers: { 'Referer': 'https://www.desidime.com/' }
      });

      const $ = cheerio.load(resp.data);
      const deals = [];

      $('.frntListItem').each((i, el) => {
        try {
          const $el = $(el);
          const title = $el.find('.frntListTitle a').text().trim();
          const link = $el.find('.frntListTitle a').attr('href');
          if (!title || !link) return;

          const fullLink = link.startsWith('http') ? link : `https://www.desidime.com${link}`;

          const priceText = $el.find('.price').first().text().replace(/[^\d]/g, '');
          const discountText = $el.find('.discount').first().text().replace(/[^\d]/g, '');
          const originalPriceText = $el.find('.strikethrough, .original-price, del').first().text().replace(/[^\d]/g, '');

          const discountedPrice = parseInt(priceText) || 0;
          const originalPrice = parseInt(originalPriceText) || (discountedPrice > 0 ? Math.round(discountedPrice * 1.35) : 0);
          const discount = parseInt(discountText) || (originalPrice > 0 ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100) : 0);

          const imageUrl = $el.find('img').first().attr('data-original') ||
            $el.find('img').first().attr('src') || null;

          const store = $el.find('.store-name, .merchant').text().trim() ||
            this._extractDomainFromUrl($el.find('a[href*="amazon"], a[href*="flipkart"], a[href*="myntra"]').attr('href') || '');

          if (!title || discountedPrice <= 0) return;

          const isAllowedStore = this._isAllowedStore(title + ' ' + store);
          if (!isAllowedStore) return;

          deals.push({
            id: `desidime-${Buffer.from(title).toString('base64').slice(0, 16)}`,
            source: store || 'desidime',
            title: title.slice(0, 200),
            originalPrice: originalPrice || discountedPrice + 200,
            discountedPrice,
            discount,
            rating: null,
            reviews: null,
            trendScore: 7,
            productUrl: fullLink,
            imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
            description: title,
            timestamp: new Date().toISOString(),
            _scraperSource: 'desidime'
          });
        } catch (e) {
          // skip bad item
        }
      });

      return deals.slice(0, 30);
    } catch (error) {
      logger.warn('Desidime scrape error', { error: error.message });
      return [];
    }
  }

  /**
   * Scrape Mydala deal aggregator
   */
  async scrapeMydala() {
    try {
      const resp = await this.client.get('https://www.mydala.com/deals/online-shopping');
      const $ = cheerio.load(resp.data);
      const deals = [];

      $('.deal-card, .deal-item, .offer-card').each((i, el) => {
        try {
          const $el = $(el);
          const title = $el.find('h3, h2, .deal-title, .offer-title').first().text().trim();
          const link = $el.find('a').first().attr('href');
          if (!title || !link) return;

          const fullLink = link.startsWith('http') ? link : `https://www.mydala.com${link}`;
          const priceMatch = $el.text().match(/₹\s*(\d[\d,]*)/g);
          const prices = (priceMatch || []).map(p => parseInt(p.replace(/[^\d]/g, ''))).filter(p => p > 0);
          const discountedPrice = prices.length > 0 ? Math.min(...prices) : 0;
          const originalPrice = prices.length > 1 ? Math.max(...prices) : (discountedPrice > 0 ? Math.round(discountedPrice * 1.3) : 0);

          if (!title || discountedPrice <= 0) return;

          deals.push({
            id: `mydala-${Buffer.from(title).toString('base64').slice(0, 16)}`,
            source: 'mydala',
            title: title.slice(0, 200),
            originalPrice: originalPrice || discountedPrice + 100,
            discountedPrice,
            discount: originalPrice > discountedPrice ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100) : 20,
            rating: null,
            reviews: null,
            trendScore: 5,
            productUrl: fullLink,
            imageUrl: null,
            description: title,
            timestamp: new Date().toISOString(),
            _scraperSource: 'mydala'
          });
        } catch (e) {
          // skip
        }
      });

      return deals.slice(0, 20);
    } catch (error) {
      logger.warn('Mydala scrape error', { error: error.message });
      return [];
    }
  }

  /**
   * Scrape GrabOn deal aggregator
   */
  async scrapeGrabOn() {
    try {
      const resp = await this.client.get('https://www.grabon.in/online-shopping-coupons/', {
        headers: { 'Referer': 'https://www.grabon.in/' }
      });
      const $ = cheerio.load(resp.data);
      const deals = [];

      $('.g-card, .deal-card, .store-offer-card').each((i, el) => {
        try {
          const $el = $(el);
          const title = $el.find('h3, h2, .offer-heading, .deal-heading').first().text().trim();
          const link = $el.find('a').first().attr('href');
          if (!title || !link) return;

          const fullLink = link.startsWith('http') ? link : `https://www.grabon.in${link}`;

          const discountMatch = $el.text().match(/(\d+)%\s*off/i);
          const discount = discountMatch ? parseInt(discountMatch[1]) : 20;

          const priceMatch = $el.text().match(/₹\s*(\d[\d,]*)/);
          const discountedPrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;
          const originalPrice = discountedPrice > 0 && discount > 0
            ? Math.round(discountedPrice / (1 - discount / 100))
            : discountedPrice + 200;

          if (!title) return;

          deals.push({
            id: `grabon-${Buffer.from(title).toString('base64').slice(0, 16)}`,
            source: 'grabon',
            title: title.slice(0, 200),
            originalPrice: originalPrice || (discountedPrice + 200),
            discountedPrice: discountedPrice || 100,
            discount,
            rating: null,
            reviews: null,
            trendScore: 4,
            productUrl: fullLink,
            imageUrl: null,
            description: title,
            timestamp: new Date().toISOString(),
            _scraperSource: 'grabon'
          });
        } catch (e) {
          // skip
        }
      });

      return deals.slice(0, 20);
    } catch (error) {
      logger.warn('GrabOn scrape error', { error: error.message });
      return [];
    }
  }

  _extractDomainFromUrl(url) {
    if (!url) return '';
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes('amazon')) return 'amazon';
      if (hostname.includes('flipkart')) return 'flipkart';
      if (hostname.includes('myntra')) return 'myntra';
      if (hostname.includes('ajio')) return 'ajio';
      if (hostname.includes('nykaa')) return 'nykaa';
      return hostname.replace('www.', '').split('.')[0];
    } catch {
      return '';
    }
  }

  _isAllowedStore(text) {
    const t = text.toLowerCase();
    const blocked = ['youtube', 'twitter', 'reddit', 'medium', 'instagram'];
    return !blocked.some(b => t.includes(b));
  }
}

module.exports = DealScraper;
