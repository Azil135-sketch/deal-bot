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
    this.strictAffiliateOnly = (process.env.STRICT_AFFILIATE_ONLY || 'true').toLowerCase() !== 'false';
    this.processedDealTtlHours = Number(process.env.PROCESSED_DEAL_TTL_HOURS || 24);
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
    const historyMap = this._readProcessedHistoryMap();

    return deals.filter(deal => {
      const fingerprint = this._buildDealFingerprint(deal);
      return !this._isFingerprintBlocked(fingerprint, historyMap);
    });
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

      const existing = this._readProcessedHistoryMap();
      const nowIso = new Date().toISOString();

      deals.forEach(deal => {
        const fingerprint = this._buildDealFingerprint(deal);
        existing[fingerprint] = nowIso;
      });

      const pruned = this._pruneExpiredHistory(existing);
      this._writeJsonFile(this.processedDealsFile, pruned);
      logger.info(`Saved ${deals.length} processed deals to history`, {
        ttlHours: this.processedDealTtlHours
      });
    } catch (error) {
      logger.warn('Failed to persist processed deals history', { error: error.message });
    }
  }

  _readProcessedHistoryMap() {
    const parsed = this._readJsonFile(this.processedDealsFile, {});

    if (Array.isArray(parsed)) {
      // Backward compatibility with legacy array format.
      const nowIso = new Date().toISOString();
      return parsed.reduce((acc, fingerprint) => {
        acc[fingerprint] = nowIso;
        return acc;
      }, {});
    }

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return parsed;
  }

  _isFingerprintBlocked(fingerprint, historyMap) {
    const processedAt = historyMap[fingerprint];
    if (!processedAt) {
      return false;
    }

    if (this.processedDealTtlHours <= 0) {
      return true;
    }

    const processedTime = new Date(processedAt).getTime();
    if (Number.isNaN(processedTime)) {
      return false;
    }

    const ageMs = Date.now() - processedTime;
    return ageMs < this.processedDealTtlHours * 60 * 60 * 1000;
  }

  _pruneExpiredHistory(historyMap) {
    if (this.processedDealTtlHours <= 0) {
      return historyMap;
    }

    const cutoffMs = Date.now() - this.processedDealTtlHours * 60 * 60 * 1000;
    return Object.entries(historyMap).reduce((acc, [fingerprint, processedAt]) => {
      const ts = new Date(processedAt).getTime();
      if (!Number.isNaN(ts) && ts >= cutoffMs) {
        acc[fingerprint] = processedAt;
      }
      return acc;
    }, {});
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

      const existing = this._readJsonFile(this.attributionFile, []);
      const attributionRecords = Array.isArray(existing) ? existing : [];

      attributionRecords.push(record);
      this._writeJsonFile(this.attributionFile, attributionRecords);
    } catch (error) {
      logger.warn('Failed to persist attribution record', { error: error.message });
    }
  }

  _readJsonFile(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) {
        return fallback;
      }

      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) {
        return fallback;
      }

      return JSON.parse(raw);
    } catch (error) {
      logger.warn('Failed parsing JSON file; using fallback and preserving invalid file', {
        filePath,
        error: error.message
      });

      const invalidFilePath = `${filePath}.invalid-${Date.now()}`;
      try {
        fs.renameSync(filePath, invalidFilePath);
        logger.warn('Moved invalid JSON file', { filePath, invalidFilePath });
      } catch (renameError) {
        logger.warn('Could not move invalid JSON file', { filePath, error: renameError.message });
      }

      return fallback;
    }
  }

  _writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
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
    const rejectedDeals = [];

    for (const deal of this.deals) {
      const subId = this.buildSubId(deal);

      try {
        // Generate Cuelinks affiliate link
        const linkData = await this.cuelinksAPI.generateLink(
          deal.productUrl,
          subId
        );

        deal.affiliateLink = linkData.link || deal.productUrl;

        const isAffiliated = deal.affiliateLink.includes('cuelinks.com');

        if (!isAffiliated) {
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

        if (isAffiliated) {
          successfullyAffiliatedDeals.push(deal);
          processedDeals.push(deal);
        } else if (this.strictAffiliateOnly) {
          rejectedDeals.push({ id: deal.id, reason: 'non_cuelinks_affiliate_link' });
          logger.warn(`Skipping unaffiliated deal ${deal.id} due to STRICT_AFFILIATE_ONLY=true`);
        } else {
          processedDeals.push(deal);
        }

        // Download product image
        if (deal.imageUrl) {
          const imageData = await this.imageHandler.downloadImage(
            deal.imageUrl,
            deal.id
          );
          deal.localImage = imageData;
        }

      } catch (error) {
        logger.warn(`Error processing deal ${deal.id}`, { error: error.message });
        deal.affiliateLink = deal.productUrl;
        this.saveAttributionRecord({
          dealId: deal.id,
          sourceUrl: deal.productUrl,
          affiliateLink: deal.productUrl,
          subId,
          generatedAt: new Date().toISOString(),
          error: error.message
        });
        if (this.strictAffiliateOnly) {
          rejectedDeals.push({ id: deal.id, reason: 'affiliate_generation_error', error: error.message });
          logger.warn(`Skipping unaffiliated deal ${deal.id} due to STRICT_AFFILIATE_ONLY=true`);
        } else {
          processedDeals.push(deal);
        }
      }
    }

    this.markDealsAsProcessed(successfullyAffiliatedDeals);

    logger.info(`Processed ${processedDeals.length} deals`, {
      affiliated: successfullyAffiliatedDeals.length,
      rejected: rejectedDeals.length,
      strictAffiliateOnly: this.strictAffiliateOnly
    });
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
