/**
   * Product Image Fetcher
   * Fetches og:image (Open Graph image) from product pages.
   * This works even on partially JS-rendered pages since og:image is often in server-side HTML.
   * Falls back gracefully — never blocks deal posting.
   */

  const axios = require('axios');
  const logger = require('./logger');

  const FETCH_TIMEOUT = 8000;
  const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

  // In-memory cache: url -> imageUrl (null if fetch failed)
  const imageCache = new Map();

  /**
   * Fetch the og:image URL from a product page.
   * @param {string} productUrl
   * @returns {Promise<string|null>}
   */
  async function fetchProductImage(productUrl) {
    if (!productUrl) return null;
    if (imageCache.has(productUrl)) return imageCache.get(productUrl);

    try {
      const resp = await axios.get(productUrl, {
        timeout: FETCH_TIMEOUT,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html',
          'Accept-Language': 'en-IN,en;q=0.9'
        },
        // Only fetch first 50KB — og:image is always in the <head>
        maxContentLength: 50 * 1024,
        responseType: 'text',
        validateStatus: s => s < 400
      });

      const html = resp.data || '';
      const imageUrl = extractOgImage(html);

      imageCache.set(productUrl, imageUrl);
      if (imageUrl) {
        logger.debug(`Image found for ${productUrl.slice(0, 60)}: ${imageUrl.slice(0, 80)}`);
      }
      return imageUrl;
    } catch (error) {
      // Log only at debug level — image failure is never fatal
      logger.debug(`Image fetch failed for ${productUrl.slice(0, 60)}: ${error.message}`);
      imageCache.set(productUrl, null);
      return null;
    }
  }

  /**
   * Extract og:image URL from raw HTML.
   * @param {string} html
   * @returns {string|null}
   */
  function extractOgImage(html) {
    if (!html) return null;

    // Match <meta property="og:image" content="..." />
    const patterns = [
      /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
      /name=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /itemprop=["']image["'][^>]*content=["']([^"']+)["']/i,
      /"@type"\s*:\s*"Product"[\s\S]{0,500}"image"\s*:\s*"([^"]+)"/i,
      /"image"\s*:\s*\[\s*"([^"]+)"/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const url = match[1].trim();
        if (url.startsWith('http') && url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
          return url;
        }
        if (url.startsWith('http') && url.includes('image')) {
          return url;
        }
      }
    }
    return null;
  }

  /**
   * Batch fetch images for multiple deals (runs in parallel, max 5 concurrent).
   * Mutates deal objects in place, adding deal.imageUrl.
   * @param {Array} deals
   * @returns {Promise<void>}
   */
  async function batchFetchImages(deals, concurrency = 5) {
    const chunks = [];
    for (let i = 0; i < deals.length; i += concurrency) {
      chunks.push(deals.slice(i, i + concurrency));
    }

    let fetched = 0;
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (deal) => {
        if (deal.imageUrl) return; // already have one
        if (!deal.productUrl) return;
        const img = await fetchProductImage(deal.productUrl);
        if (img) {
          deal.imageUrl = img;
          fetched++;
        }
      }));
    }

    logger.info(`Image fetch: ${fetched}/${deals.length} deals got images`);
  }

  module.exports = { fetchProductImage, batchFetchImages };
  