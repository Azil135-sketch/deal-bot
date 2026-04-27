/**
 * Price Tracker v4.1
 * 
 * Simple JSON-file-based price history tracking.
 * Purpose: detect genuine price drops and avoid posting "fake" deals
 * where the MRP was inflated just to show a high % discount.
 * 
 * Also enables "Price Drop Alerts" — when a tracked product's price
 * falls below its 7-day average, it gets a boost in quality score.
 * 
 * Storage: data/price_history.json (lightweight, Git-committed)
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const HISTORY_FILE = path.join(__dirname, '../data/price_history.json');
const MAX_HISTORY_DAYS = 14;
const PRICE_DROP_THRESHOLD_PCT = 10; // 10% below 7-day avg = real drop

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return {};
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveHistory(history) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  } catch (error) {
    logger.warn('Failed to save price history', { error: error.message });
  }
}

/**
 * Record a price snapshot for a deal.
 * @param {Object} deal
 */
function recordPrice(deal) {
  if (!deal || !deal.id || !deal.productUrl) return;

  const history = loadHistory();
  const key = deal.id;
  const now = Date.now();

  if (!history[key]) {
    history[key] = {
      title: deal.title,
      url: deal.productUrl,
      prices: []
    };
  }

  history[key].prices.push({
    price: deal.discountedPrice,
    original: deal.originalPrice,
    discount: deal.discount,
    date: now
  });

  // Trim old entries
  const cutoff = now - (MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  history[key].prices = history[key].prices.filter(p => p.date > cutoff);

  saveHistory(history);
}

/**
 * Check if a deal has a genuine price drop compared to its history.
 * Returns { isPriceDrop, avgPrice, dropPct, historyDays }
 */
function checkPriceDrop(deal) {
  if (!deal || !deal.id) return { isPriceDrop: false, avgPrice: 0, dropPct: 0, historyDays: 0 };

  const history = loadHistory();
  const record = history[deal.id];
  if (!record || record.prices.length < 2) {
    return { isPriceDrop: false, avgPrice: 0, dropPct: 0, historyDays: 0 };
  }

  const recent = record.prices.slice(-7);
  const avgPrice = recent.reduce((sum, p) => sum + p.price, 0) / recent.length;
  const current = deal.discountedPrice;

  if (avgPrice <= 0) return { isPriceDrop: false, avgPrice, dropPct: 0, historyDays: recent.length };

  const dropPct = ((avgPrice - current) / avgPrice) * 100;
  const isPriceDrop = dropPct >= PRICE_DROP_THRESHOLD_PCT;

  return { isPriceDrop, avgPrice: Math.round(avgPrice), dropPct: Math.round(dropPct), historyDays: recent.length };
}

/**
 * Detect "fake discount" — when original price was never actually sold at that price.
 * Heuristic: if the same product was previously seen at a much lower "original" price,
 * the current "original" price may be inflated.
 * 
 * Returns { isFake, previousOriginal, inflationPct }
 */
function detectFakeDiscount(deal) {
  if (!deal || !deal.id || !deal.originalPrice) {
    return { isFake: false, previousOriginal: 0, inflationPct: 0 };
  }

  const history = loadHistory();
  const record = history[deal.id];
  if (!record || record.prices.length < 3) {
    return { isFake: false, previousOriginal: 0, inflationPct: 0 };
  }

  const originals = record.prices.map(p => p.original).filter(o => o > 0);
  if (originals.length === 0) return { isFake: false, previousOriginal: 0, inflationPct: 0 };

  const medianOriginal = originals.sort((a, b) => a - b)[Math.floor(originals.length / 2)];
  const currentOriginal = deal.originalPrice;

  if (medianOriginal <= 0) return { isFake: false, previousOriginal: 0, inflationPct: 0 };

  const inflationPct = ((currentOriginal - medianOriginal) / medianOriginal) * 100;
  // If current MRP is 30%+ higher than historical median, it's likely inflated
  const isFake = inflationPct >= 30;

  return { isFake, previousOriginal: medianOriginal, inflationPct: Math.round(inflationPct) };
}

/**
 * Batch record prices for all deals after a run.
 */
function batchRecordPrices(deals) {
  for (const deal of deals) {
    recordPrice(deal);
  }
  logger.info(`Price history updated for ${deals.length} deals`);
}

/**
 * Enrich deals with price-drop / fake-discount signals.
 * Mutates deal in place: adds _priceDrop and _fakeDiscount fields.
 */
function enrichWithPriceSignals(deals) {
  for (const deal of deals) {
    const drop = checkPriceDrop(deal);
    const fake = detectFakeDiscount(deal);

    deal._priceDrop = drop.isPriceDrop;
    deal._priceDropPct = drop.dropPct;
    deal._fakeDiscount = fake.isFake;
    deal._inflationPct = fake.inflationPct;

    if (drop.isPriceDrop) {
      logger.debug(`Price drop detected: ${deal.title.slice(0, 50)} — ${drop.dropPct}% below 7d avg`);
    }
    if (fake.isFake) {
      logger.warn(`Fake discount suspected: ${deal.title.slice(0, 50)} — MRP inflated ${fake.inflationPct}%`);
    }
  }
  return deals;
}

module.exports = {
  recordPrice,
  checkPriceDrop,
  detectFakeDiscount,
  batchRecordPrices,
  enrichWithPriceSignals,
  loadHistory,
  saveHistory
};
