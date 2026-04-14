/**
 * Deal Bot v2.0 - Main Entry Point
 * Orchestrates the deal fetching, content generation, and broadcasting pipeline
 */

require('dotenv').config();

const logger = require('./logger');
const DealFetcher = require('./fetchDeals');
const ContentGenerator = require('./contentGenerator');
const Broadcaster = require('./broadcaster');

class DealBotOrchestrator {
  constructor() {
    this.fetcher = new DealFetcher();
    this.generator = new ContentGenerator();
    this.broadcaster = new Broadcaster();
  }

  /**
   * Run the complete deal bot pipeline
   */
  async run() {
    try {
      logger.info('=== Deal Bot v2.0 Starting ===');

      // Step 1: Fetch deals
      logger.info('Step 1: Fetching deals from all sources');
      const deals = await this.fetcher.fetchAllDeals();

      if (deals.length === 0) {
        logger.warn('No deals found, exiting');
        return;
      }

      logger.info(`Found ${deals.length} deals`);

      // Step 2: Process deals with affiliate links and images
      logger.info('Step 2: Processing deals with Cuelinks affiliate links');
      const processedDeals = await this.fetcher.processDealsWithAffiliateLinks();

      logger.info(`Processed ${processedDeals.length} deals`);

      // Step 3: Generate content
      logger.info('Step 3: Generating content for deals');
      const contentByPlatform = {
        telegram: this.generator.generateMultipleContent(processedDeals, 'telegram'),
        twitter: this.generator.generateMultipleContent(processedDeals, 'twitter'),
        email: this.generator.generateMultipleContent(processedDeals, 'email')
      };

      logger.info('Content generated for all platforms');

      // Step 4: Broadcast deals
      logger.info('Step 4: Broadcasting deals to all channels');
      const broadcastResults = await this.broadcaster.broadcastAll(processedDeals);

      logger.info('=== Deal Bot Pipeline Completed Successfully ===');
      logger.info('Results:', broadcastResults);

      return {
        success: true,
        dealsProcessed: processedDeals.length,
        broadcast: broadcastResults
      };
    } catch (error) {
      logger.error('Fatal error in deal bot pipeline', { error: error.message });
      throw error;
    }
  }
}

// Main execution
async function main() {
  try {
    // Validate required environment variables
    const requiredEnvVars = ['CUELINKS_API_KEY'];
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missingEnvVars.length > 0) {
      logger.error('Missing required environment variables', {
        missing: missingEnvVars,
        hint: 'Please copy .env.example to .env and fill in the required values'
      });
      process.exit(1);
    }

    const orchestrator = new DealBotOrchestrator();
    const result = await orchestrator.run();

    console.log('\n=== FINAL RESULTS ===\n', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error in main', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = DealBotOrchestrator;
