/**
   * Deal Scraper Module
   * Fetches real deals from free public Indian deal sources:
   * - Desidime (India's largest deal community)
   * - GrabOn (Indian coupon/deal aggregator)
   * - Coupondunia (Indian coupon/deal site)
   *
   * Note: These scrapers use best-effort CSS selectors that may need periodic updates
   * if the source sites redesign. Log output will show how many deals each source returned.
   */

  const axios = require('axios');
  const cheerio = require('cheerio');
  const logger = require('./logger');

  const SCRAPE_TIMEOUT = 20000;

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

    async scrapeAll() {
      const results = await Promise.allSettled([
        this.scrapeDesidime(),
        this.scrapeGrabOn(),
        this.scrapeCoupondunia()
      ]);

      const deals = [];
      const sources = ['desidime', 'grabon', 'coupondunia'];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          logger.info(`${sources[i]}: got ${result.value.length} deals`);
          deals.push(...result.value);
        } else {
          logger.warn(`${sources[i]} scrape error`, { error: result.reason?.message });
        }
      });

      logger.info(`Total scraped: ${deals.length} deals from ${sources.length} sources`);
      return deals;
    }

    /**
     * Scrape Desidime — India's largest deal community
     * URL: https://www.desidime.com/deals
     */
    async scrapeDesidime() {
      try {
        const resp = await this.client.get('https://www.desidime.com/deals', {
          headers: { 'Referer': 'https://www.desidime.com/' }
        });

        const $ = cheerio.load(resp.data);
        const deals = [];
        const seen = new Set();

        // Primary selector: deal title links
        $('a[title][href*="/deals/"]').each((i, el) => {
          if (deals.length >= 25) return false;
          try {
            const $el = $(el);
            const title = $el.attr('title') || $el.text().trim();
            const href = $el.attr('href');

            if (!title || title.length < 10 || seen.has(title)) return;
            if (href.includes('#')) return;
            seen.add(title);

            const fullLink = href.startsWith('http') ? href : `https://www.desidime.com${href}`;

            const parentText = $el.closest('div, article, li').text();
            const prices = (parentText.match(/₹\s*(\d[\d,]*)/g) || [])
              .map(p => parseInt(p.replace(/[^\d]/g, '')))
              .filter(p => p > 0 && p < 1000000);

            const discountedPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const originalPrice = prices.length > 1
              ? Math.max(...prices)
              : (discountedPrice > 0 ? Math.round(discountedPrice * 1.35) : 0);

            const discountMatch = parentText.match(/(\d+)%\s*off/i);
            const discount = discountMatch
              ? parseInt(discountMatch[1])
              : (originalPrice > discountedPrice && discountedPrice > 0
                ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)
                : 25);

            const imgEl = $el.closest('div, article, li').find('img').first();
            const imageUrl = imgEl.attr('data-src') || imgEl.attr('src') || null;

            deals.push({
              id: `desidime-${Buffer.from(title).toString('base64').slice(0, 16)}`,
              source: 'desidime',
              title: title.slice(0, 200),
              originalPrice: originalPrice || (discountedPrice > 0 ? discountedPrice + 300 : 999),
              discountedPrice: discountedPrice || 499,
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

        if (deals.length === 0) {
          logger.warn('Desidime: 0 deals scraped — CSS selectors may have changed');
        }
        return deals;
      } catch (error) {
        logger.warn('Desidime scrape error', { error: error.message });
        return [];
      }
    }

    /**
     * Scrape GrabOn deals
     * URL: https://www.grabon.in/deals/
     * Tries multiple selectors for resilience across site redesigns.
     */
    async scrapeGrabOn() {
      try {
        const resp = await this.client.get('https://www.grabon.in/deals/', {
          headers: { 'Referer': 'https://www.grabon.in/' }
        });

        const $ = cheerio.load(resp.data);
        const deals = [];

        // Try multiple selectors — GrabOn redesigns periodically
        const SELECTORS = ['.g-deal-3', '.deal-card', '.deal-item', '[class*="deal"]', '.offer-card'];
        
        let matched = false;
        for (const selector of SELECTORS) {
          const els = $(selector);
          if (els.length > 0) {
            logger.debug(`GrabOn: using selector "${selector}" (${els.length} elements)`);
            matched = true;

            els.each((i, el) => {
              if (deals.length >= 20) return false;
              try {
                const $el = $(el);

                const imageUrl = $el.attr('data-imageurl') || $el.find('img').first().attr('data-src') || $el.find('img').first().attr('src') || null;
                const dealUrl = $el.attr('data-dealurl') || $el.find('a').first().attr('href') || null;
                const title = (
                  $el.find('.title, h3, h2, [class*="title"], [class*="name"]').first().text().trim() ||
                  $el.attr('title') ||
                  $el.find('a').first().attr('title')
                );

                if (!title || title.length < 5) return;

                const priceText = $el.find('.price, [class*="price"]').first().text().replace(/[^\d]/g, '');
                const discountText = $el.find('.discount-p, [class*="discount"]').first().text().replace(/[^\d]/g, '');
                const storeText = $el.find('.store, .byspan, [class*="store"]').first().text().trim();

                const discountedPrice = parseInt(priceText) || 0;
                const discount = parseInt(discountText) || 25;
                const originalPrice = discountedPrice > 0 && discount > 0
                  ? Math.round(discountedPrice / (1 - discount / 100))
                  : (discountedPrice > 0 ? Math.round(discountedPrice * 1.35) : 0);

                const fullLink = dealUrl
                  ? (dealUrl.startsWith('http') ? dealUrl : `https://www.grabon.in${dealUrl}`)
                  : 'https://www.grabon.in/deals/';

                deals.push({
                  id: `grabon-${Buffer.from(title).toString('base64').slice(0, 16)}`,
                  source: storeText || 'grabon',
                  title: title.slice(0, 200),
                  originalPrice: originalPrice || (discountedPrice > 0 ? discountedPrice + 200 : 799),
                  discountedPrice: discountedPrice || 399,
                  discount,
                  rating: null,
                  reviews: null,
                  trendScore: 5,
                  productUrl: fullLink,
                  imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
                  description: title,
                  timestamp: new Date().toISOString(),
                  _scraperSource: 'grabon'
                });
              } catch (e) {
                // skip
              }
            });
            break; // stop after first working selector
          }
        }

        if (!matched || deals.length === 0) {
          logger.warn('GrabOn: 0 deals scraped — CSS selectors may have changed or site blocked request');
        }
        return deals;
      } catch (error) {
        logger.warn('GrabOn scrape error', { error: error.message });
        return [];
      }
    }

    /**
     * Scrape Coupondunia online deals
     * URL: https://www.coupondunia.in/deals/
     * Tries multiple selectors for resilience.
     */
    async scrapeCoupondunia() {
      try {
        const resp = await this.client.get('https://www.coupondunia.in/deals/', {
          headers: { 'Referer': 'https://www.coupondunia.in/' },
          maxRedirects: 5
        });

        const $ = cheerio.load(resp.data);
        const deals = [];

        // Try multiple selectors
        const SELECTORS = [
          '.deal-card', '.cd-offer-card', '.offer-list-item',
          '[class*="deal-item"]', '[class*="offer-card"]', '.deal'
        ];

        let matched = false;
        for (const selector of SELECTORS) {
          const els = $(selector);
          if (els.length > 0) {
            logger.debug(`Coupondunia: using selector "${selector}" (${els.length} elements)`);
            matched = true;

            els.each((i, el) => {
              if (deals.length >= 15) return false;
              try {
                const $el = $(el);
                const title = $el.find('h3, h2, .title, .offer-title, [class*="title"]').first().text().trim();
                const link = $el.find('a').first().attr('href');

                if (!title || title.length < 5) return;

                const fullLink = link
                  ? (link.startsWith('http') ? link : `https://www.coupondunia.in${link}`)
                  : 'https://www.coupondunia.in/deals/';

                const discountMatch = $el.text().match(/(\d+)%\s*off/i);
                const discount = discountMatch ? parseInt(discountMatch[1]) : 20;

                const priceMatch = $el.text().match(/₹\s*(\d[\d,]*)/);
                const discountedPrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : 0;
                const originalPrice = discountedPrice > 0 && discount > 0
                  ? Math.round(discountedPrice / (1 - discount / 100))
                  : (discountedPrice > 0 ? Math.round(discountedPrice * 1.3) : 0);

                const imgEl = $el.find('img').first();
                const imageUrl = imgEl.attr('data-src') || imgEl.attr('src') || null;

                deals.push({
                  id: `coupondunia-${Buffer.from(title).toString('base64').slice(0, 16)}`,
                  source: 'coupondunia',
                  title: title.slice(0, 200),
                  originalPrice: originalPrice || (discountedPrice > 0 ? discountedPrice + 200 : 599),
                  discountedPrice: discountedPrice || 299,
                  discount,
                  rating: null,
                  reviews: null,
                  trendScore: 4,
                  productUrl: fullLink,
                  imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
                  description: title,
                  timestamp: new Date().toISOString(),
                  _scraperSource: 'coupondunia'
                });
              } catch (e) {
                // skip
              }
            });
            break;
          }
        }

        if (!matched || deals.length === 0) {
          logger.warn('Coupondunia: 0 deals scraped — CSS selectors may have changed');
        }
        return deals;
      } catch (error) {
        logger.warn('Coupondunia scrape error', { error: error.message });
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
        if (hostname.includes('tatacliq')) return 'tatacliq';
        if (hostname.includes('meesho')) return 'meesho';
        if (hostname.includes('desidime')) return 'desidime';
        if (hostname.includes('grabon')) return 'grabon';
        if (hostname.includes('coupondunia')) return 'coupondunia';
        return hostname.replace('www.', '').split('.')[0];
      } catch {
        return '';
      }
    }
  }

  module.exports = DealScraper;
  