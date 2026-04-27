/**
 * Deal Fetcher & Orchestrator
 * 
 * The MISSING CRITICAL FILE that ties the entire pipeline together:
 *   1. Load manual curated deals from data/deals.json
 *   2. Scrape deals from RSS/HTML sources (DealScraper)
 *   3. Deduplicate across sources
 *   4. Quality filter (DealIntelligence)
 *   5. Quality score (dealQualityScorer)
 *   6. Affiliate link generation (AffiliateRouter)
 *   7. Stock validation (stockChecker)
 *   8. Product image fetching (productImageFetcher)
 *   9. Return broadcast-ready deals
 */

require('dotenv').config();

const logger = require('./logger');
const DealScraper = require('./dealScraper');
const DealIntelligence = require('./dealIntelligence');
const AffiliateRouter = require('./affiliateRouter');
const { filterAndRankDeals } = require('./dealQualityScorer');
const { batchCheckStock } = require('./stockChecker');
const { batchFetchImages } = require('./productImageFetcher');
const fs = require('fs');
const path = require('path');

const DEALS_FILE = process.env.DEALS_FILE || path.join(__dirname, '../data/deals.json');
const MAX_DEALS_PER_RUN = parseInt(process.env.MAX_DEALS_PER_RUN || '8');
const MIN_QUALITY_SCORE = parseInt(process.env.MIN_QUALITY_SCORE || '22');
const CHECK_STOCK = (process.env.CHECK_STOCK || 'true').toLowerCase() === 'true';
const FETCH_PRODUCT_IMAGES = (process.env.FETCH_PRODUCT_IMAGES || 'true').toLowerCase() === 'true';

class DealFetcher {
  constructor() {
    this.scraper = new DealScraper();
    this.intelligence = new DealIntelligence();
    this.affiliateRouter = new AffiliateRouter();
  }

  /**
   * Main entry: fetch and process all deals end-to-end.
   */
  async fetchAllDeals() {
    logger.info('=== DealFetcher: Starting full pipeline ===');

    // Step 1: Collect deals from all sources
    const [manualDeals, scrapedDeals] = await Promise.allSettled([
      this.loadManualDeals(),
      this.scraper.scrapeAll()
    ]);

    let allDeals = [];
    if (manualDeals.status === 'fulfilled') {
      logger.info(`Manual deals loaded: ${manualDeals.value.length}`);
      allDeals.push(...manualDeals.value);
    } else {
      logger.warn(`Manual deals failed: ${manualDeals.reason?.message}`);
    }

    if (scrapedDeals.status === 'fulfilled') {
      logger.info(`Scraped deals loaded: ${scrapedDeals.value.length}`);
      allDeals.push(...scrapedDeals.value);
    } else {
      logger.warn(`Scraped deals failed: ${scrapedDeals.reason?.message}`);
    }

    if (allDeals.length === 0) {
      logger.warn('No deals found from any source');
      return [];
    }

    // Step 2: Deduplicate by product URL + title similarity
    allDeals = this.deduplicateDeals(allDeals);
    logger.info(`After deduplication: ${allDeals.length} deals`);

    // Step 3: DealIntelligence validation + scoring
    const validDeals = this.intelligence.selectTopDeals(allDeals);
    logger.info(`After intelligence filter: ${validDeals.length} deals`);

    if (validDeals.length === 0) return [];

    // Step 4: Advanced quality scoring + ranking
    const scoredDeals = filterAndRankDeals(validDeals, MIN_QUALITY_SCORE, MAX_DEALS_PER_RUN * 2);
    logger.info(`After quality scoring (min ${MIN_QUALITY_SCORE}): ${scoredDeals.length} deals`);

    if (scoredDeals.length === 0) return [];

    // Step 5: Generate affiliate links for all deals
    logger.info('Attaching affiliate links...');
    const dealsWithAffiliate = await this.attachAffiliateLinks(scoredDeals);
    const withAffiliate = dealsWithAffiliate.filter(d => d.affiliateLink);
    logger.info(`Deals with affiliate links: ${withAffiliate.length}/${dealsWithAffiliate.length}`);

    // Drop deals that have no working link at all
    const linkReadyDeals = dealsWithAffiliate.filter(d => d.affiliateLink || d.productUrl);
    if (linkReadyDeals.length === 0) {
      logger.warn('No deals have valid product/affiliate URLs');
      return [];
    }

    // Step 6: Stock check (if enabled)
    let stockCheckedDeals = linkReadyDeals;
    if (CHECK_STOCK) {
      stockCheckedDeals = await batchCheckStock(linkReadyDeals, 3);
      logger.info(`After stock check: ${stockCheckedDeals.length} in-stock deals`);
    }

    // Step 7: Price history tracking + fake discount detection
    const { enrichWithPriceSignals, batchRecordPrices } = require('./priceTracker');
    enrichWithPriceSignals(stockCheckedDeals);
    const cleanDeals = stockCheckedDeals.filter(d => !d._fakeDiscount);
    if (cleanDeals.length < stockCheckedDeals.length) {
      logger.warn(`Removed ${stockCheckedDeals.length - cleanDeals.length} deals with suspected fake/inflated discounts`);
    }

    // Step 8: Fetch product images (if enabled and missing)
    if (FETCH_PRODUCT_IMAGES) {
      await batchFetchImages(cleanDeals, 4);
    }

    // Step 9: Record prices for future tracking
    batchRecordPrices(cleanDeals);

    // Step 10: Final slice to max deals per run
    const finalDeals = cleanDeals.slice(0, MAX_DEALS_PER_RUN);
    logger.info(`=== DealFetcher: ${finalDeals.length} deals ready for broadcast ===`);

    return finalDeals;
  }

  /**
   * Alias for index.js compatibility.
   */
  async processDealsWithAffiliateLinks() {
    return this.fetchAllDeals();
  }

  /**
   * Load manually curated deals from data/deals.json.
   */
  async loadManualDeals() {
    try {
      if (!fs.existsSync(DEALS_FILE)) {
        logger.debug(`Manual deals file not found: ${DEALS_FILE}`);
        return [];
      }
      const raw = fs.readFileSync(DEALS_FILE, 'utf8');
      const deals = JSON.parse(raw);
      if (!Array.isArray(deals)) return [];

      return deals.map(d => ({
        ...d,
        _source: 'manual',
        _needsUrlResolution: false,
        _isSearchUrl: false,
        _urlSource: 'manual'
      }));
    } catch (error) {
      logger.warn('Failed to load manual deals', { error: error.message });
      return [];
    }
  }

  /**
   * Generate affiliate links for each deal.
   */
  async attachAffiliateLinks(deals) {
    const results = [];
    for (const deal of deals) {
      try {
        const url = deal.productUrl;
        if (!url) {
          results.push(deal);
          continue;
        }

        const affiliateResult = await this.affiliateRouter.getAffiliateLink(
          url,
          `dealbot-${deal.id || 'unknown'}`,
          deal._needsUrlResolution === true
        );

        if (affiliateResult.link) {
          deal.affiliateLink = affiliateResult.link;
          deal.affiliateMethod = affiliateResult.method;
          if (affiliateResult.resolvedUrl && affiliateResult.resolvedUrl !== url) {
            deal.productUrl = affiliateResult.resolvedUrl;
          }
        } else {
          // If affiliate failed but we have original URL, keep it with UTM
          deal.affiliateLink = url;
          deal.affiliateMethod = 'passthrough';
        }

        results.push(deal);
      } catch (error) {
        logger.debug(`Affiliate link failed for ${deal.title?.slice(0, 40)}: ${error.message}`);
        deal.affiliateLink = deal.productUrl;
        deal.affiliateMethod = 'error-fallback';
        results.push(deal);
      }
    }
    return results;
  }

  /**
   * Deduplicate deals by exact URL or high title similarity.
   */
  deduplicateDeals(deals) {
    const seenUrls = new Set();
    const seenTitles = new Set();
    const unique = [];

    for (const deal of deals) {
      const url = (deal.productUrl || '').trim();
      const title = (deal.title || '').trim().toLowerCase();

      // Exact URL match
      if (url && seenUrls.has(url)) continue;
      if (url) seenUrls.add(url);

      // Title fuzzy match (first 40 chars)
      const titleKey = title.slice(0, 40);
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      unique.push(deal);
    }

    return unique;
  }
}

module.exports = DealFetcher;
