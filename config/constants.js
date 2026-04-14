/**
 * Application Constants
 */

module.exports = {
  // API Configuration
  CUELINKS_API_BASE: 'https://api.cuelinks.com/v2',
  CUELINKS_API_TIMEOUT: 10000,
  CUELINKS_MAX_RETRIES: 3,
  CUELINKS_RETRY_DELAY: 1000,

  // Image Configuration
  IMAGE_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  IMAGE_TIMEOUT: 10000,
  IMAGE_CLEANUP_DAYS: 7,

  // Deal Sources
  DEAL_SOURCES: {
    AMAZON: 'amazon',
    FLIPKART: 'flipkart',
    MYNTRA: 'myntra'
  },

  // Content Platforms
  PLATFORMS: {
    TELEGRAM: 'telegram',
    TWITTER: 'twitter',
    EMAIL: 'email'
  },

  // Logging Levels
  LOG_LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  },

  // Default Values
  DEFAULT_LOG_LEVEL: 'info',
  DEFAULT_OUTPUT_DIR: './deals',
  DEFAULT_IMAGE_DIR: './deals/images',
  DEFAULT_SUBID: 'deal-bot-v2'
};
