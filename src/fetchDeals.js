/**
 * Fetch Deals Module
 * Aggregates deals from:
 *   1. Manual JSON file (DEALS_FILE) — curated, highest quality
 *   2. DealScraper — auto scrapes Desidime, Mydala, GrabOn
 * Then dedupes, history-filters, and runs DealIntelligence scoring.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const AffiliateRouter = require('./affiliateRouter');
const ImageHandler = require('./imageHandler');
const DealIntelligence = require('./dealIntelligence');
const DealScraper = require('./dealScraper');

class DealFetcher {
  constructor() {
    this.affiliateRouter = new AffiliateRouter();
    this.imageHandler = new ImageHandler();
    this.deals = [];
    this.outputDir = process.env.OUTPUT_DIR || './deals';
    this.processedDealsFile = path.join(this.outputDir, 'processed-deals.json');
    this.attributionFile = path.join(this.outputDir, 'affiliate-attribution-log.json');
    this.dealIntelligence = new DealIntelligence();
    this.dealScraper = new DealScraper();
    this.strictAffiliateOnly = (process.env.STRICT_AFFILIATE_ONLY || 'false').toLowerCase() === 'true';
    this.processedDealTtlHours = Number(process.env.PROCESSED_DEAL_TTL_HOURS || 24);
  }

  /**
   * Fetch deals from all configured sources
   * @returns {Promise<Array>}
   */
  async fetchAllDeals() {
    logger.info('Starting deal fetching process');

    try {
      const allDeals = [];

      // Priority 1: manual JSON feed (curated deals)
      const fileDeals = await this.fetchDealsFromFile();
      allDeals.push(...fileDeals);
      logger.info(`File source: ${fileDeals.length} deals`);

      // Priority 2: auto web scrapers
      const scrapedDeals = await this.dealScraper.scrapeAll();
      allDeals.push(...scrapedDeals);
      logger.info(`Web scrapers: ${scrapedDeals.length} deals`);

      const dedupedDeals = this.deduplicateDeals(allDeals);
      const newDeals = this.filterAlreadyProcessedDeals(dedupedDeals);
      const selectedDeals = this.dealIntelligence.selectTopDeals(newDeals);

      logger.info(
        `Total: ${allDeals.length} raw | ${dedupedDeals.length} deduped | ` +
        `${newDeals.length} new | ${selectedDeals.length} after intelligence filter`
      );

      this.deals = selectedDeals;
      return this.deals;
    } catch (error) {
      logger.error('Error fetching deals', { error: error.message });
      throw error;
    }
  }

  /**
   * Optionally load deals from a JSON file path in DEALS_FILE
   */
  async fetchDealsFromFile() {
    const dealsFile = process.env.DEALS_FILE;
    if (!dealsFile) return [];

    try {
      const absolutePath = path.resolve(dealsFile);
      if (!fs.existsSync(absolutePath)) {
        logger.warn(`DEALS_FILE not found: ${absolutePath}`);
        return [];
      }

      const raw = fs.readFileSync(absolutePath, 'utf8').trim();
      if (!raw || raw === '[]') return [];

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        logger.warn('DEALS_FILE must contain a JSON array');
        return [];
      }

      return parsed;
    } catch (error) {
      logger.warn('Failed loading DEALS_FILE', { error: error.message });
      return [];
    }
  }

  deduplicateDeals(deals) {
    const seen = new Set();
    return deals.filter(deal => {
      const fingerprint = this._buildDealFingerprint(deal);
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });
  }

  filterAlreadyProcessedDeals(deals) {
    const historyMap = this._readProcessedHistoryMap();
    return deals.filter(deal => {
      const fingerprint = this._buildDealFingerprint(deal);
      return !this._isFingerprintBlocked(fingerprint, historyMap);
    });
  }

  markDealsAsProcessed(deals) {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
      const existing = this._readProcessedHistoryMap();
      const nowIso = new Date().toISOString();
      deals.forEach(deal => {
        existing[this._buildDealFingerprint(deal)] = nowIso;
      });
      const pruned = this._pruneExpiredHistory(existing);
      this._writeJsonFile(this.processedDealsFile, pruned);
      logger.info(`Saved ${deals.length} processed deals to history`);
    } catch (error) {
      logger.warn('Failed to persist processed deals history', { error: error.message });
    }
  }

  _readProcessedHistoryMap() {
    const parsed = this._readJsonFile(this.processedDealsFile, {});
    if (Array.isArray(parsed)) {
      const nowIso = new Date().toISOString();
      return parsed.reduce((acc, fp) => { acc[fp] = nowIso; return acc; }, {});
    }
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  }

  _isFingerprintBlocked(fingerprint, historyMap) {
    const processedAt = historyMap[fingerprint];
    if (!processedAt) return false;
    if (this.processedDealTtlHours <= 0) return true;
    const ageMs = Date.now() - new Date(processedAt).getTime();
    if (Number.isNaN(ageMs)) return false;
    return ageMs < this.processedDealTtlHours * 3600 * 1000;
  }

  _pruneExpiredHistory(historyMap) {
    if (this.processedDealTtlHours <= 0) return historyMap;
    const cutoffMs = Date.now() - this.processedDealTtlHours * 3600 * 1000;
    return Object.entries(historyMap).reduce((acc, [fp, ts]) => {
      const t = new Date(ts).getTime();
      if (!Number.isNaN(t) && t >= cutoffMs) acc[fp] = ts;
      return acc;
    }, {});
  }

  _buildDealFingerprint(deal) {
    const base = deal.id || deal.productUrl || `${deal.title}-${deal.discountedPrice}`;
    return crypto.createHash('sha1').update(String(base)).digest('hex');
  }

  saveAttributionRecord(record) {
    try {
      if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
      const existing = this._readJsonFile(this.attributionFile, []);
      const records = Array.isArray(existing) ? existing : [];
      records.push(record);
      this._writeJsonFile(this.attributionFile, records);
    } catch (error) {
      logger.warn('Failed to persist attribution record', { error: error.message });
    }
  }

  _readJsonFile(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      logger.warn('Failed parsing JSON file, using fallback', { filePath, error: error.message });
      try { fs.renameSync(filePath, `${filePath}.invalid-${Date.now()}`); } catch {}
      return fallback;
    }
  }

  _writeJsonFile(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  }

  buildSubId(deal) {
    return `${deal.id || 'deal'}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 48);
  }

  /**
   * Process deals — get affiliate links via AffiliateRouter, download images.
   * AffiliateRouter tries Cuelinks first, then direct tracking params, then passthrough.
   * STRICT_AFFILIATE_ONLY defaults to false so deals post even without Cuelinks approval.
   */
  async processDealsWithAffiliateLinks() {
    logger.info(`Processing ${this.deals.length} deals for affiliate links`);

    const processedDeals = [];
    const affiliatedDeals = [];

    for (const deal of this.deals) {
      const subId = this.buildSubId(deal);

      try {
        const { link, method } = await this.affiliateRouter.getAffiliateLink(deal.productUrl, subId);
        deal.affiliateLink = link;
        deal.affiliateMethod = method;

        const isCuelinks = method === 'cuelinks';
        if (isCuelinks) affiliatedDeals.push(deal);

        this.saveAttributionRecord({
          dealId: deal.id,
          sourceUrl: deal.productUrl,
          affiliateLink: deal.affiliateLink,
          method,
          subId,
          generatedAt: new Date().toISOString()
        });

        if (!this.strictAffiliateOnly || isCuelinks) {
          processedDeals.push(deal);
        } else {
          logger.warn(`Skipping deal ${deal.id} — STRICT_AFFILIATE_ONLY=true and no Cuelinks link`);
        }

        if (deal.imageUrl) {
          try {
            deal.localImage = await this.imageHandler.downloadImage(deal.imageUrl, deal.id);
          } catch {}
        }

      } catch (error) {
        logger.warn(`Error processing deal ${deal.id}`, { error: error.message });
        deal.affiliateLink = deal.productUrl;
        deal.affiliateMethod = 'passthrough';
        this.saveAttributionRecord({
          dealId: deal.id, sourceUrl: deal.productUrl,
          affiliateLink: deal.productUrl, method: 'passthrough',
          subId, generatedAt: new Date().toISOString(), error: error.message
        });
        if (!this.strictAffiliateOnly) processedDeals.push(deal);
      }
    }

    this.markDealsAsProcessed(affiliatedDeals.length > 0 ? affiliatedDeals : processedDeals);

    logger.info(`Processed ${processedDeals.length} deals`, {
      affiliated: affiliatedDeals.length,
      strictAffiliateOnly: this.strictAffiliateOnly
    });

    return processedDeals;
  }
}

async function main() {
  try {
    require('dotenv').config();
    const fetcher = new DealFetcher();
    await fetcher.fetchAllDeals();
    const processedDeals = await fetcher.processDealsWithAffiliateLinks();
    logger.info('Deal fetching completed', { totalDeals: processedDeals.length });
    console.log(JSON.stringify(processedDeals, null, 2));
  } catch (error) {
    logger.error('Fatal error in deal fetching', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = DealFetcher;
