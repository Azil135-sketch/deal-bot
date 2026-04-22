/**
 * Product Image Fetcher
 *
 * Fetches og:image from product pages AND validates it matches the deal.
 * Without validation, stale/recycled product URLs return the WRONG product's image.
 * (e.g., a Myntra product ID that now shows a doormat instead of a hoodie)
 *
 * Validation: extract og:title from the page, check if title keywords overlap
 * with the deal title. If overlap < threshold → discard image (return null).
 *
 * For search URL deals (_isSearchUrl=true): skip image fetch entirely.
 * Search results pages have generic store images, not the product image.
 */

const axios = require('axios');
const logger = require('./logger');

const FETCH_TIMEOUT = 8000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// Minimum word overlap ratio to consider an image valid for a deal
const MIN_TITLE_OVERLAP = 0.25; // at least 25% of title words must appear on the fetched page

const imageCache = new Map(); // url → { imageUrl, pageTitle }

/**
 * Fetch og:image from a product URL.
 * Validates that the fetched page actually matches the deal title.
 * Returns null if the page doesn't match (e.g., stale/recycled product ID).
 *
 * @param {string} productUrl
 * @param {string} dealTitle - used for validation
 * @returns {Promise<string|null>}
 */
async function fetchProductImage(productUrl, dealTitle = '') {
  if (!productUrl) return null;

  const cacheKey = productUrl;
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey);
    if (cached === null) return null;
    // Re-validate against current deal title in case same URL is reused
    if (dealTitle && cached.pageTitle && !titleMatchesDeal(cached.pageTitle, dealTitle)) {
      logger.debug(`Cached image rejected for "${dealTitle.slice(0, 40)}" — page title mismatch`);
      return null;
    }
    return cached.imageUrl;
  }

  try {
    const resp = await axios.get(productUrl, {
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
        'Accept-Language': 'en-IN,en;q=0.9'
      },
      maxContentLength: 80 * 1024,
      responseType: 'text',
      validateStatus: s => s < 400
    });

    const html = resp.data || '';
    const imageUrl = extractOgImage(html);
    const pageTitle = extractOgTitle(html) || extractHtmlTitle(html) || '';

    // CRITICAL: Validate page title matches deal title before accepting the image
    if (dealTitle && pageTitle) {
      if (!titleMatchesDeal(pageTitle, dealTitle)) {
        logger.warn(
          `Image rejected — page title mismatch.\n` +
          `  Deal:  "${dealTitle.slice(0, 70)}"\n` +
          `  Page:  "${pageTitle.slice(0, 70)}"\n` +
          `  URL:   ${productUrl.slice(0, 70)}`
        );
        imageCache.set(cacheKey, null);
        return null;
      }
    }

    const result = imageUrl ? { imageUrl, pageTitle } : null;
    imageCache.set(cacheKey, result);

    if (imageUrl) {
      logger.debug(`Image validated for "${dealTitle.slice(0, 40)}": ${imageUrl.slice(0, 60)}`);
    }
    return imageUrl;

  } catch (error) {
    if (error.response?.status === 404) {
      logger.debug(`Product page 404: ${productUrl.slice(0, 60)}`);
    } else {
      logger.debug(`Image fetch error for ${productUrl.slice(0, 60)}: ${error.message}`);
    }
    imageCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Check if the page title sufficiently overlaps with the deal title.
 * Uses word-level matching, ignoring common stop words.
 */
function titleMatchesDeal(pageTitle, dealTitle) {
  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'for', 'of', 'to', 'in', 'at', 'on',
    'buy', 'online', 'india', 'price', 'off', 'sale', 'best', 'get', 'with',
    'men', 'women', 'boys', 'girls', 'kids', 'set', 'pack', 'combo', 'new',
    'free', 'cod', 'shipping', 'myntra', 'nykaa', 'ajio', 'amazon', 'flipkart'
  ]);

  const tokenize = str => str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const dealWords = new Set(tokenize(dealTitle));
  const pageWords = new Set(tokenize(pageTitle));

  if (dealWords.size === 0) return true; // No deal title to compare — accept
  if (pageWords.size === 0) return true; // No page title to compare — accept

  let overlap = 0;
  for (const word of dealWords) {
    if (pageWords.has(word)) overlap++;
  }

  const ratio = overlap / dealWords.size;
  return ratio >= MIN_TITLE_OVERLAP;
}

function extractOgImage(html) {
  if (!html) return null;

  const patterns = [
    /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /name=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /itemprop=["']image["'][^>]*content=["']([^"']+)["']/i,
    /"@type"\s*:\s*"Product"[\s\S]{0,500}"image"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const url = match[1].trim();
      if (url.startsWith('http') && (url.match(/\.(jpg|jpeg|png|webp|gif)/i) || url.includes('image'))) {
        return url;
      }
    }
  }
  return null;
}

function extractOgTitle(html) {
  const patterns = [
    /property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function extractHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

/**
 * Batch fetch images for multiple deals.
 * Skips search-URL deals (they have no specific product image to fetch).
 * Validates title match before accepting any image.
 *
 * @param {Array} deals
 * @param {number} concurrency
 */
async function batchFetchImages(deals, concurrency = 4) {
  const dealsNeedingImages = deals.filter(d => {
    if (d.imageUrl) return false; // already has one
    if (d._isSearchUrl === true) return false; // search page — no point fetching
    if (!d.productUrl) return false;
    return true;
  });

  const chunks = [];
  for (let i = 0; i < dealsNeedingImages.length; i += concurrency) {
    chunks.push(dealsNeedingImages.slice(i, i + concurrency));
  }

  let fetched = 0;
  let rejected = 0;
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async deal => {
      const img = await fetchProductImage(deal.productUrl, deal.title);
      if (img) {
        deal.imageUrl = img;
        fetched++;
      } else {
        rejected++;
      }
    }));
  }

  const skipped = deals.length - dealsNeedingImages.length;
  logger.info(`Images: ${fetched} fetched, ${rejected} rejected (title mismatch/error), ${skipped} skipped (search URLs / already had image)`);
}

module.exports = { fetchProductImage, batchFetchImages };
