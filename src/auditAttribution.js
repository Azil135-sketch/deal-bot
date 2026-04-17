/**
 * Attribution Audit
 * Cross-checks local generated subIds against Cuelinks transactions.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const CuelinksAPI = require('./cuelinksAPI');
const logger = require('./logger');

async function main() {
  try {
    const outputDir = process.env.OUTPUT_DIR || './deals';
    const attributionFile = path.join(outputDir, 'affiliate-attribution-log.json');

    if (!fs.existsSync(attributionFile)) {
      logger.warn('No attribution log found. Run fetch first.');
      process.exit(0);
    }

    const records = JSON.parse(fs.readFileSync(attributionFile, 'utf8'));
    const subIds = [...new Set(records.map(record => record.subId).filter(Boolean))];

    if (subIds.length === 0) {
      logger.warn('No subIds found in attribution log.');
      process.exit(0);
    }

    const api = new CuelinksAPI();
    const endDate = new Date();
    const startDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));

    const toDate = date => date.toISOString().slice(0, 10);
    const transactions = await api.getTransactions(toDate(startDate), toDate(endDate));

    const txBySubId = new Map();
    transactions.forEach(transaction => {
      if (transaction.subid) {
        txBySubId.set(transaction.subid, transaction);
      }
    });

    const matched = subIds.filter(subId => txBySubId.has(subId));

    const report = {
      generatedSubIds: subIds.length,
      matchedTransactions: matched.length,
      unmatchedSubIds: subIds.filter(subId => !txBySubId.has(subId)).slice(0, 50),
      sampleMatches: matched.slice(0, 10).map(subId => txBySubId.get(subId))
    };

    logger.info('Attribution audit report generated', report);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (error.message.includes('403')) {
      logger.warn('Attribution audit could not authenticate with Cuelinks. Check API key/permissions.', { error: error.message });
      process.exit(0);
    }

    logger.error('Failed to run attribution audit', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
