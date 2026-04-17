/**
 * Deal Intelligence Module
 * Scores and filters deals for quality, relevance, and conversion potential.
 */

const logger = require('./logger');

class DealIntelligence {
  constructor() {
    this.minDiscount = Number(process.env.MIN_DISCOUNT_PERCENT || 20);
    this.minSavings = Number(process.env.MIN_SAVINGS_AMOUNT || 300);
    this.minRating = Number(process.env.MIN_RATING || 3.8);
    this.maxDealsPerRun = Number(process.env.MAX_DEALS_PER_RUN || 20);
    this.blockedKeywords = (process.env.BLOCKED_KEYWORDS || 'refurbished,renewed,used')
      .split(',')
      .map(keyword => keyword.trim().toLowerCase())
      .filter(Boolean);
  }

  /**
   * Score and select top deals.
   * @param {Array} deals
   * @returns {Array}
   */
  selectTopDeals(deals) {
    const scoredDeals = deals
      .map(deal => this.scoreDeal(deal))
      .filter(deal => this.passesQualityFloor(deal))
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, this.maxDealsPerRun);

    logger.info(`Deal intelligence selected ${scoredDeals.length}/${deals.length} deals`);
    return scoredDeals;
  }

  /**
   * Compute a weighted quality score.
   * @param {Object} deal
   * @returns {Object}
   */
  scoreDeal(deal) {
    const originalPrice = Number(deal.originalPrice || 0);
    const discountedPrice = Number(deal.discountedPrice || 0);
    const discount = Number(deal.discount || (originalPrice > 0 ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100) : 0));
    const savings = Math.max(0, originalPrice - discountedPrice);
    const rating = Number(deal.rating || 0);
    const reviews = Number(deal.reviews || 0);
    const trendScore = Number(deal.trendScore || 0);

    const discountComponent = Math.min(discount, 80) * 0.35;
    const savingsComponent = Math.min(savings / 100, 50) * 0.2;
    const ratingComponent = Math.max(0, rating - 3) * 12;
    const reviewsComponent = Math.min(Math.log10(reviews + 1) * 8, 16);
    const trendComponent = Math.min(Math.max(trendScore, 0), 10) * 2;

    const qualityScore = Number((discountComponent + savingsComponent + ratingComponent + reviewsComponent + trendComponent).toFixed(2));

    return {
      ...deal,
      discount,
      savings,
      rating,
      reviews,
      qualityScore
    };
  }

  /**
   * Enforce hard quality limits.
   * @param {Object} deal
   * @returns {boolean}
   */
  passesQualityFloor(deal) {
    const normalizedTitle = String(deal.title || '').toLowerCase();

    const hasBlockedKeyword = this.blockedKeywords.some(keyword => normalizedTitle.includes(keyword));
    if (hasBlockedKeyword) {
      return false;
    }

    if (deal.discount < this.minDiscount) {
      return false;
    }

    if (deal.savings < this.minSavings) {
      return false;
    }

    if (deal.rating && deal.rating < this.minRating) {
      return false;
    }

    return true;
  }
}

module.exports = DealIntelligence;
