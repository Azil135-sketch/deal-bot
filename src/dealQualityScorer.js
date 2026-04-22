/**
 * Deal Quality Scorer
 *
 * Scores each deal 0–100 based on signals that predict whether someone will
 * actually click and buy — not just whether the discount looks big.
 *
 * High score = worth broadcasting. Low score = dropped.
 * This replaces the old "trend score" which was just a rough estimate.
 *
 * Scoring factors:
 *   - Discount depth (deeper = higher score, but diminishing returns)
 *   - Absolute savings (₹500+ matters more than %)
 *   - Price point (₹100–₹2500 range converts best for impulse buys)
 *   - Review count + rating (social proof)
 *   - Store trustworthiness (Myntra/Nykaa/Amazon = higher trust)
 *   - Category relevance (fashion/beauty/electronics convert better than home)
 *   - Is it a known brand (boAt, Puma, Mamaearth, etc.)
 */

const logger = require('./logger');

// Stores ranked by how well their affiliate links convert
const STORE_CONVERSION_SCORE = {
  'myntra': 18, 'ajio': 16, 'nykaa': 17, 'amazon': 15, 'flipkart': 14,
  'tatacliq': 12, 'meesho': 10, 'croma': 11, 'healthkart': 13,
  'netmeds': 10, 'pharmeasy': 10, '1mg': 10, 'tata1mg': 10,
  'snapdeal': 7, 'bewakoof': 8, 'firstcry': 9, 'pepperfry': 8,
  'lenskart': 9, 'default': 6
};

// Brands that users trust and are more likely to buy
const KNOWN_BRANDS = new Set([
  'boat', 'noise', 'realme', 'redmi', 'samsung', 'apple', 'oneplus', 'vivo', 'oppo',
  'puma', 'adidas', 'nike', 'reebok', 'skechers', 'hm', 'h&m', 'levis', 'levi\'s',
  'roadster', 'hrx', 'highlander', 'here&now', 'mango', 'zara',
  'mamaearth', 'minimalist', 'wow', 'plum', 'dot&key', 'foxtale', 'pilgrim',
  'l\'oreal', 'loreal', 'lakme', 'maybelline', 'nykaa', 'sugar',
  'muscleblaze', 'optimum nutrition', 'on', 'muscletech', 'dymatize',
  'philips', 'bosch', 'lg', 'whirlpool', 'havells', 'usha', 'pigeon', 'prestige',
  'milton', 'cello', 'tupperware',
  'titan', 'fastrack', 'fossil', 'casio',
  'vlcc', 'himalaya', 'patanjali', 'dabur',
  'lenskart', 'john jacobs', 'vincent chase',
  'portronics', 'zebronics', 'intex', 'amkette',
]);

// Keywords that suggest a product likely to convert
const HIGH_CONVERT_KEYWORDS = [
  'earbuds', 'headphone', 'headset', 'tws', 'bluetooth', 'wireless',
  'serum', 'moisturizer', 'sunscreen', 'spf', 'vitamin c', 'niacinamide',
  'whey', 'protein', 'creatine', 'bcaa',
  'tshirt', 't-shirt', 'jeans', 'hoodie', 'kurta', 'dress', 'top',
  'sneakers', 'shoes', 'footwear', 'sandals',
  'watch', 'smartwatch',
  'perfume', 'deodorant', 'shampoo', 'conditioner',
  'laptop bag', 'backpack', 'wallet', 'handbag',
  'trimmer', 'epilator', 'straightener', 'dryer',
  'air fryer', 'cooler', 'fan',
];

// Deals we should skip — low click value or irrelevant to shopping
const SKIP_PATTERNS = [
  /cashback/i, /quiz/i, /recharge/i, /\bbank\s+offer/i, /lottery/i,
  /freebie/i, /refer\s+and\s+earn/i, /\bspin\b/i, /gold coin/i,
  /silver coin/i, /gold bar/i, /\bemi\b.*\bfree\b/i,
  /news/i, /article/i, /review\s+roundup/i
];

/**
 * Score a single deal.
 * @param {Object} deal
 * @returns {number} 0–100
 */
function scoreDeal(deal) {
  const title = (deal.title || '').toLowerCase();
  const source = (deal.source || deal._storeRaw || '').toLowerCase();
  const discount = deal.discount || 0;
  const discountedPrice = deal.discountedPrice || 0;
  const originalPrice = deal.originalPrice || 0;
  const savings = originalPrice - discountedPrice;
  const rating = parseFloat(deal.rating) || 0;
  const reviews = parseInt(deal.reviews) || 0;

  // Hard skip — these deals are never worth broadcasting
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(deal.title || '')) return 0;
  }

  let score = 0;

  // === Discount depth (max 25 pts) ===
  if (discount >= 70) score += 25;
  else if (discount >= 60) score += 22;
  else if (discount >= 50) score += 18;
  else if (discount >= 40) score += 14;
  else if (discount >= 30) score += 10;
  else if (discount >= 20) score += 6;
  else score += 2;

  // === Absolute savings (max 20 pts) ===
  if (savings >= 3000) score += 20;
  else if (savings >= 2000) score += 17;
  else if (savings >= 1000) score += 14;
  else if (savings >= 500) score += 10;
  else if (savings >= 200) score += 6;
  else if (savings >= 100) score += 3;

  // === Price point — sweet spot for impulse buys (max 15 pts) ===
  if (discountedPrice > 0) {
    if (discountedPrice <= 299) score += 15; // Sub-₹300 = very easy decision
    else if (discountedPrice <= 599) score += 12;
    else if (discountedPrice <= 999) score += 10;
    else if (discountedPrice <= 1999) score += 7;
    else if (discountedPrice <= 3999) score += 4;
    else score += 1;
  }

  // === Social proof — rating + reviews (max 20 pts) ===
  if (rating >= 4.5 && reviews >= 10000) score += 20;
  else if (rating >= 4.3 && reviews >= 5000) score += 16;
  else if (rating >= 4.0 && reviews >= 1000) score += 12;
  else if (rating >= 4.0 && reviews >= 100) score += 8;
  else if (rating >= 3.5) score += 4;

  // === Store conversion quality (max 18 pts) ===
  let storeScore = STORE_CONVERSION_SCORE['default'];
  for (const [key, val] of Object.entries(STORE_CONVERSION_SCORE)) {
    if (source.includes(key) || key === source) {
      storeScore = val;
      break;
    }
  }
  score += storeScore;

  // === Known brand bonus (5 pts) ===
  for (const brand of KNOWN_BRANDS) {
    if (title.includes(brand)) {
      score += 5;
      break;
    }
  }

  // === High-convert product category (5 pts) ===
  for (const kw of HIGH_CONVERT_KEYWORDS) {
    if (title.includes(kw)) {
      score += 5;
      break;
    }
  }

  // === Source quality bonus (2 pts for manual deals from deals.json) ===
  if (!deal._scraperSource) score += 2; // Manual curated deal

  return Math.min(Math.round(score), 100);
}

/**
 * Score all deals and filter out ones below threshold.
 * Sorts by score descending so best deals are broadcast first.
 *
 * @param {Array} deals
 * @param {number} minScore - minimum score to keep (default 20)
 * @param {number} maxDeals - maximum to keep after scoring
 * @returns {Array} filtered + sorted deals
 */
function filterAndRankDeals(deals, minScore = 20, maxDeals = 10) {
  const scored = deals
    .map(deal => {
      const score = scoreDeal(deal);
      deal.qualityScore = score;
      return { deal, score };
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxDeals)
    .map(({ deal }) => deal);

  const dropped = deals.length - scored.length;
  logger.info(`Quality scorer: ${scored.length} passed, ${dropped} dropped (score < ${minScore}). Top score: ${scored[0]?.qualityScore || 'n/a'}`);

  if (scored.length > 0) {
    logger.debug('Top deals by quality score:');
    scored.slice(0, 3).forEach(d => {
      logger.debug(`  [${d.qualityScore}] ${d.title.slice(0, 60)} — ${d.source}`);
    });
  }

  return scored;
}

module.exports = { scoreDeal, filterAndRankDeals };
