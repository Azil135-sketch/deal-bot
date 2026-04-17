/**
 * Fetch Deals Module
 * Aggregates deals from various e-commerce sources
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const CuelinksAPI = require('./cuelinksAPI');
const ImageHandler = require('./imageHandler');
const DealIntelligence = require('./dealIntelligence');

class DealFetcher {
  constructor() {
    this.cuelinksAPI = new CuelinksAPI();
    this.imageHandler = new ImageHandler();
    this.deals = [];
    this.outputDir = process.env.OUTPUT_DIR || './deals';
    this.processedDealsFile = path.join(this.outputDir, 'processed-deals.json');
    this.attributionFile = path.join(this.outputDir, 'affiliate-attribution-log.json');
    this.dealIntelligence = new DealIntelligence();
  }

  /**
   * Fetch deals from all configured sources
   * @returns {Promise<Array>} - Array of deal objects
   */
  async fetchAllDeals() {
    logger.info('Starting deal fetching process');

    try {
      // Fetch from Amazon
      const amazonDeals = await this.fetchAmazonDeals();
      this.deals.push(...amazonDeals);

      // Fetch from Flipkart
      const flipkartDeals = await this.fetchFlipkartDeals();
      this.deals.push(...flipkartDeals);

      // Fetch from Myntra
      const myntraDeals = await this.fetchMyntraDeals();
      this.deals.push(...myntraDeals);

      // Optional JSON feed for production-like runs
      const fileDeals = await this.fetchDealsFromFile();
      this.deals.push(...fileDeals);

      const dedupedDeals = this.deduplicateDeals(this.deals);
      const newDeals = this.filterAlreadyProcessedDeals(dedupedDeals);
      const selectedDeals = this.dealIntelligence.selectTopDeals(newDeals);

      logger.info(`Fetched ${this.deals.length} deals total, ${newDeals.length} new after dedupe/history checks, ${selectedDeals.length} after intelligence filter`);
      this.deals = selectedDeals;
      return this.deals;
    } catch (error) {
      logger.error('Error fetching deals', { error: error.message });
      throw error;
    }
  }

  /**
   * Fetch deals from Amazon
   * @private
   */
  async fetchAmazonDeals() {
    logger.info('Fetching Amazon deals');

    try {
      // This is a placeholder - in production, you would use:
      // - Amazon Product Advertising API
      // - Web scraping (with proper rate limiting and headers)
      // - RSS feeds if available
      // - Third-party deal aggregation APIs

      const deals = [];

      logger.debug(`Fetched ${deals.length} deals from Amazon`);
      return deals;
    } catch (error) {
      logger.warn('Error fetching Amazon deals', { error: error.message });
      return [];
    }
  }

  /**
   * Fetch deals from Flipkart
   * @private
   */
  async fetchFlipkartDeals() {
    logger.info('Fetching Flipkart deals');

    try {
      // Placeholder for Flipkart deal fetching
      const deals = [];

      logger.debug(`Fetched ${deals.length} deals from Flipkart`);
      return deals;
    } catch (error) {
      logger.warn('Error fetching Flipkart deals', { error: error.message });
      return [];
    }
  }

  /**
   * Fetch deals from Myntra
   * @private
   */
  async fetchMyntraDeals() {
    logger.info('Fetching Myntra deals');

    try {
      // Placeholder for Myntra deal fetching
      const deals = [];

      logger.debug(`Fetched ${deals.length} deals from Myntra`);
      return deals;
    } catch (error) {
      logger.warn('Error fetching Myntra deals', { error: error.message });
      return [];
    }
  }

  /**
   * Optionally load deals from a JSON file path in DEALS_FILE
   * @returns {Promise<Array>}
   */
  async fetchDealsFromFile() {
    const dealsFile = process.env.DEALS_FILE;

    if (!dealsFile) {
      return [];
    }

    try {
      const absolutePath = path.resolve(dealsFile);
      if (!fs.existsSync(absolutePath)) {
        logger.warn(`DEALS_FILE not found: ${absolutePath}`);
        return [];
      }

      const raw = fs.readFileSync(absolutePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        logger.warn('DEALS_FILE must contain a JSON array of deals');
        return [];
      }

      logger.info(`Loaded ${parsed.length} deals from DEALS_FILE`);
      return parsed;
    } catch (error) {
      logger.warn('Failed loading deals from DEALS_FILE', { error: error.message });
      return [];
    }
  }

  /**
   * Remove duplicate deals from current run using id/url fingerprint
   * @param {Array} deals
   * @returns {Array}
   */
  deduplicateDeals(deals) {
    const seen = new Set();

    return deals.filter(deal => {
      const fingerprint = this._buildDealFingerprint(deal);
      if (seen.has(fingerprint)) {
        return false;
      }

      seen.add(fingerprint);
      return true;
    });
  }

  /**
   * Remove deals already processed in previous runs
   * @param {Array} deals
   * @returns {Array}
   */
  filterAlreadyProcessedDeals(deals) {
    const history = this._readProcessedHistory();

    return deals.filter(deal => !history.includes(this._buildDealFingerprint(deal)));
  }

  /**
   * Persist processed deal fingerprints for future dedupe
   * @param {Array} deals
   */
  markDealsAsProcessed(deals) {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const existing = this._readProcessedHistory();
      const incoming = deals.map(deal => this._buildDealFingerprint(deal));
      const merged = [...new Set([...existing, ...incoming])];

      fs.writeFileSync(this.processedDealsFile, JSON.stringify(merged, null, 2));
      logger.info(`Saved ${incoming.length} processed deals to history`);
    } catch (error) {
      logger.warn('Failed to persist processed deals history', { error: error.message });
    }
  }

  _readProcessedHistory() {
    try {
      if (!fs.existsSync(this.processedDealsFile)) {
        return [];
      }

      const raw = fs.readFileSync(this.processedDealsFile, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      logger.warn('Failed reading processed deals history', { error: error.message });
      return [];
    }
  }

  _buildDealFingerprint(deal) {
    const base = deal.id || deal.productUrl || `${deal.title}-${deal.discountedPrice}`;
    return crypto.createHash('sha1').update(String(base)).digest('hex');
  }

  /**
   * Persist affiliate mapping data for reconciliation with Cuelinks reports
   * @param {Object} record
   */
  saveAttributionRecord(record) {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const existing = fs.existsSync(this.attributionFile)
        ? JSON.parse(fs.readFileSync(this.attributionFile, 'utf8'))
        : [];

      existing.push(record);
      fs.writeFileSync(this.attributionFile, JSON.stringify(existing, null, 2));
    } catch (error) {
      logger.warn('Failed to persist attribution record', { error: error.message });
    }
  }

  /**
   * Build a deterministic subId for click/revenue attribution.
   * @param {Object} deal
   * @returns {string}
   */
  buildSubId(deal) {
    const raw = `${deal.id || 'deal'}-${Date.now()}`;
    return raw.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 48);
  }

  /**
   * Process deals with Cuelinks affiliate links and images
   * @returns {Promise<Array>} - Processed deals with affiliate links
   */
  async processDealsWithAffiliateLinks() {
    logger.info('Processing deals with Cuelinks affiliate links');

    const processedDeals = [];
    const successfullyAffiliatedDeals = [];

    for (const deal of this.deals) {
      const subId = this.buildSubId(deal);

      try {
        // Generate Cuelinks affiliate link
        const linkData = await this.cuelinksAPI.generateLink(
          deal.productUrl,
          subId
        );

        deal.affiliateLink = linkData.link || deal.productUrl;

        if (!deal.affiliateLink.includes('cuelinks.com')) {
          logger.warn(`Cuelinks returned a non-cuelinks URL for ${deal.id}`, {
            affiliateLink: deal.affiliateLink
          });
        }

        logger.debug(`Generated affiliate link for ${deal.id}`, {
          sourceUrl: deal.productUrl,
          affiliateLink: deal.affiliateLink
        });

        this.saveAttributionRecord({
          dealId: deal.id,
          sourceUrl: deal.productUrl,
          affiliateLink: deal.affiliateLink,
          subId,
          generatedAt: new Date().toISOString()
        });

        if (deal.affiliateLink.includes('cuelinks.com')) {
          successfullyAffiliatedDeals.push(deal);
        }

        // Download product image
        if (deal.imageUrl) {
          const imageData = await this.imageHandler.downloadImage(
            deal.imageUrl,
            deal.id
          );
          deal.localImage = imageData;
        }

        processedDeals.push(deal);
      } catch (error) {
        logger.warn(`Error processing deal ${deal.id}`, { error: error.message });
        // Still include the deal, but without affiliate link
        deal.affiliateLink = deal.productUrl;
        this.saveAttributionRecord({
          dealId: deal.id,
          sourceUrl: deal.productUrl,
          affiliateLink: deal.productUrl,
          subId,
          generatedAt: new Date().toISOString(),
          error: error.message
        });
        processedDeals.push(deal);
      }
    }

    this.markDealsAsProcessed(successfullyAffiliatedDeals);

    logger.info(`Processed ${processedDeals.length} deals`, { affiliated: successfullyAffiliatedDeals.length });
    return processedDeals;
  }
}

// Main execution
async function main() {
  try {
    require('dotenv').config();

    const fetcher = new DealFetcher();
    const deals = await fetcher.fetchAllDeals();
    const processedDeals = await fetcher.processDealsWithAffiliateLinks();

    logger.info('Deal fetching completed successfully', {
      totalDeals: processedDeals.length
    });

    // Output deals as JSON
    console.log(JSON.stringify(processedDeals, null, 2));
  } catch (error) {
    logger.error('Fatal error in deal fetching', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DealFetcher;
