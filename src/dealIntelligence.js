/**
 * Deal Intelligence Module
 * Scores and filters deals for quality, relevance, and conversion potential.
 */

const logger = require('./logger');

class DealIntelligence {
  constructor() {
    this.minDiscount = Number(process.env.MIN_DISCOUNT_PERCENT || 20);
    this.minSavings = Number(process.env.MIN_SAVINGS_AMOUNT || 200);
    this.minRating = Number(process.env.MIN_RATING || 3.5);
    this.maxDealsPerRun = Number(process.env.MAX_DEALS_PER_RUN || 20);
    this.blockedKeywords = (process.env.BLOCKED_KEYWORDS || 'refurbished,renewed,used')
      .split(',')
      .map(keyword => keyword.trim().toLowerCase())
      .filter(Boolean);
    this.allowedDealDomains = (process.env.ALLOWED_DEAL_DOMAINS || 'amazon.,flipkart.,myntra.,ajio.,nykaa.,tatacliq.,croma.,reliancedigital.,meesho.,snapdeal.,desidime.com,grabon.in,coupondunia.in')
      .split(',')
      .map(domain => domain.trim().toLowerCase())
      .filter(Boolean);
    this.rejectNewsContent = (process.env.REJECT_NEWS_CONTENT || 'true').toLowerCase() !== 'false';
    this.newsPathPatterns = ['/news', '/article', '/story', '/opinion', '/live-blog', '/analysis'];
    this.nonCommerceHostMarkers = ['news', 'blog', 'medium', 'substack', 'youtube', 'reddit', 'x.com', 'twitter'];
  }

  /**
   * Score and select top deals.
   * @param {Array} deals
   * @returns {Array}
   */
  selectTopDeals(deals) {
    const rejectedByReason = {
      invalid: 0,
      quality: 0
    };

    const scoredDeals = deals
      .filter(deal => {
        const valid = this.isValidDealCandidate(deal);
        if (!valid) rejectedByReason.invalid += 1;
        return valid;
      })
      .map(deal => this.scoreDeal(deal))
      .filter(deal => {
        const pass = this.passesQualityFloor(deal);
        if (!pass) rejectedByReason.quality += 1;
        return pass;
      })
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, this.maxDealsPerRun);

    logger.info(`Deal intelligence selected ${scoredDeals.length}/${deals.length} deals`, rejectedByReason);
    return scoredDeals;
  }

  /**
   * Reject non-product/news-like inputs before scoring.
   * @param {Object} deal
   * @returns {boolean}
   */
  isValidDealCandidate(deal) {
    if (!deal || typeof deal !== 'object') {
      return false;
    }

    const title = String(deal.title || '').trim();
    const productUrl = String(deal.productUrl || '').trim();
    const originalPrice = Number(deal.originalPrice || 0);
    const discountedPrice = Number(deal.discountedPrice || 0);

    if (!title || !productUrl || !Number.isFinite(originalPrice) || !Number.isFinite(discountedPrice)) {
      return false;
    }

    if (originalPrice <= 0 || discountedPrice <= 0 || discountedPrice >= originalPrice) {
      return false;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(productUrl);
    } catch {
      return false;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    const normalizedTitle = title.toLowerCase();

    if (this.rejectNewsContent) {
      if (this.nonCommerceHostMarkers.some(marker => hostname.includes(marker))) {
        return false;
      }

      if (this.newsPathPatterns.some(pattern => pathname.includes(pattern))) {
        return false;
      }

      if (/\b(news|headline|breaking|report|analysis|opinion)\b/i.test(normalizedTitle)) {
        return false;
      }
    }

    if (this.allowedDealDomains.length > 0) {
      const inAllowedDomain = this.allowedDealDomains.some(allowed => hostname.includes(allowed));
      if (!inAllowedDomain) {
        return false;
      }
    }

    return true;
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
