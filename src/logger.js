/**
 * Logger utility for consistent logging across the application
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

const logger = {
  error: (message, data = null) => {
    if (currentLogLevel >= LOG_LEVELS.error) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, data || '');
    }
  },

  warn: (message, data = null) => {
    if (currentLogLevel >= LOG_LEVELS.warn) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data || '');
    }
  },

  info: (message, data = null) => {
    if (currentLogLevel >= LOG_LEVELS.info) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data || '');
    }
  },

  debug: (message, data = null) => {
    if (currentLogLevel >= LOG_LEVELS.debug) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, data || '');
    }
  }
};

module.exports = logger;
