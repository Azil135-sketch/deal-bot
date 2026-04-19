/**
   * Deal Bot v3.0 - Main Entry Point
   * Full pipeline: scrape → affiliate links → content → broadcast
   * Runs as one-shot (GitHub Actions) or as a server with webhook (Replit/VPS).
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
        logger.info('=== Deal Bot v3.0 Starting ===');

        // Step 1: Fetch deals (file + scrapers)
        logger.info('Step 1: Fetching deals from all sources');
        const deals = await this.fetcher.fetchAllDeals();

        if (deals.length === 0) {
          logger.warn('No deals found after all sources and filters');
          return { success: true, dealsProcessed: 0, broadcast: null, message: 'No deals found' };
        }

        logger.info(`Found ${deals.length} quality deals`);

        // Step 2: Attach affiliate links
        logger.info('Step 2: Attaching affiliate links');
        const processedDeals = await this.fetcher.processDealsWithAffiliateLinks();

        if (processedDeals.length === 0) {
          logger.warn('No deals available after affiliate processing');
          return { success: true, dealsProcessed: 0, broadcast: null, message: 'No deals after affiliate processing' };
        }

        logger.info(`${processedDeals.length} deals ready to broadcast`);

        // Step 3: Set up bot commands (idempotent — safe to call every run)
        await this.growthEngine.setupBotCommands();

        // Step 4: Broadcast
        logger.info('Step 4: Broadcasting deals');
        const broadcastResults = await this.broadcaster.broadcastAll(processedDeals);

        logger.info('=== Deal Bot Pipeline Completed ===');
        return { success: true, dealsProcessed: processedDeals.length, broadcast: broadcastResults };
      } catch (error) {
        logger.error('Fatal error in deal bot pipeline', { error: error.message });
        throw error;
      }
    }
  }

  async function main(exitWhenDone = true) {
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — deals will be fetched but not broadcast');
      }
      if (!process.env.CUELINKS_API_KEY) {
        logger.warn('CUELINKS_API_KEY not set — affiliate links will use direct tracking params only');
      }

      const orchestrator = new DealBotOrchestrator();
      const result = await orchestrator.run();

      console.log('\n=== FINAL RESULTS ===\n', JSON.stringify(result, null, 2));
      if (exitWhenDone) process.exit(0);
      return result;
    } catch (error) {
      logger.error('Fatal error in main', { error: error.message });
      if (exitWhenDone) process.exit(1);
      throw error;
    }
  }

  if (require.main === module) {
    const mode = process.env.BOT_MODE || 'oneshot';

    if (mode === 'server') {
      // Server mode: run pipeline + start webhook server for bot commands
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
      // One-shot mode (default — GitHub Actions)
      main();
    }
  }

  module.exports = DealBotOrchestrator;
  