/**
 * Deal Bot v4.0 - Main Orchestrator
 * 
 * Full pipeline: scrape → resolve real URLs → affiliate links → 
 * quality check → stock verify → content → broadcast everywhere
 * 
 * Modes:
 *   - oneshot (default): Run once and exit (GitHub Actions)
 *   - server: Run with webhook server + scheduled intervals (Replit/VPS)
 */

require('dotenv').config();

const logger = require('./logger');
const DealFetcher = require('./fetchDeals');
const ContentGenerator = require('./contentGenerator');
const Broadcaster = require('./broadcaster');
const GrowthEngine = require('./growthEngine');

class DealBotOrchestrator {
  constructor() {
    this.fetcher = new DealFetcher();
    this.generator = new ContentGenerator();
    this.broadcaster = new Broadcaster();
    this.growthEngine = new GrowthEngine();
  }

  async run() {
    try {
      logger.info('=== Deal Bot v4.0 Starting ===');

      // Step 1: Fetch deals from all sources
      logger.info('Step 1: Fetching deals from all sources');
      const deals = await this.fetcher.fetchAllDeals();

      if (deals.length === 0) {
        logger.warn('No deals found after all sources and filters');
        return { success: true, dealsProcessed: 0, message: 'No deals found' };
      }

      logger.info(`Found ${deals.length} quality deals`);

      // Step 2: Attach affiliate links (with real URL resolution)
      logger.info('Step 2: Processing affiliate links with real URL resolution');
      const processedDeals = await this.fetcher.processDealsWithAffiliateLinks();

      if (processedDeals.length === 0) {
        logger.warn('No deals available after affiliate processing');
        return { success: true, dealsProcessed: 0, message: 'No deals after processing' };
      }

      logger.info(`${processedDeals.length} deals ready to broadcast`);

      // Step 3: Log deal summary
      processedDeals.forEach(d => {
        logger.debug(`Deal: ${d.title.slice(0, 60)} | ${d.source} | ${d.affiliateMethod || 'no-affiliate'} | URL source: ${d._urlSource || 'unknown'}`);
      });

      // Step 4: Set up bot commands
      await this.growthEngine.setupBotCommands();

      // Step 5: Broadcast to all channels
      logger.info('Step 3: Broadcasting deals everywhere');
      const broadcastResults = await this.broadcaster.broadcastAll(processedDeals);

      logger.info('=== Deal Bot v4.0 Pipeline Completed ===');
      return {
        success: true,
        dealsProcessed: processedDeals.length,
        broadcast: broadcastResults,
        deals: processedDeals.map(d => ({
          id: d.id,
          title: d.title.slice(0, 60),
          source: d.source,
          discount: d.discount,
          affiliateMethod: d.affiliateMethod,
          urlSource: d._urlSource || 'unknown'
        }))
      };
    } catch (error) {
      logger.error('Fatal error in deal bot pipeline', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

async function main(exitWhenDone = true) {
  try {
    // Validate critical environment
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — deals will be fetched but not broadcast');
    }
    if (!process.env.CUELINKS_API_KEY && !process.env.EARNKARO_PUBLIC_TOKEN) {
      logger.warn('No affiliate API keys set — using UTM tracking fallback only');
    }

    const orchestrator = new DealBotOrchestrator();
    const result = await orchestrator.run();

    console.log('\n=== FINAL RESULTS ===\n', JSON.stringify(result, null, 2));
    if (exitWhenDone) process.exit(0);
    return result;
  } catch (error) {
    logger.error('Fatal error in main', { error: error.message, stack: error.stack });
    if (exitWhenDone) process.exit(1);
    throw error;
  }
}

if (require.main === module) {
  const mode = process.env.BOT_MODE || 'oneshot';

  if (mode === 'server') {
    // Server mode: webhook + scheduled runs
    const WebhookServer = require('./webhookServer');
    const server = new WebhookServer();
    server.start();

    const intervalMinutes = Number(process.env.RUN_INTERVAL_MINUTES || 60);
    let isRunInProgress = false;

    const executeRun = async () => {
      if (isRunInProgress) {
        logger.warn('Skipping run — previous run still in progress');
        return;
      }
      isRunInProgress = true;
      try {
        await main(false);
      } finally {
        isRunInProgress = false;
      }
    };

    executeRun();
    setInterval(executeRun, intervalMinutes * 60 * 1000);
  } else {
    // One-shot mode (GitHub Actions)
    main();
  }
}

module.exports = DealBotOrchestrator;
