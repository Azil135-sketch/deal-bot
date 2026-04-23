/**
 * Manual Reddit Post Generator
 * 
 * Since reddit.com/prefs/apps doesn't work for everyone,
 * this script generates formatted Reddit posts you can copy-paste manually.
 * 
 * Usage:
 *   node src/manualReddit.js          # Uses latest deals from data/deals.json
 *   node src/manualReddit.js --best   # Uses the single best deal
 * 
 * Copy the output, go to reddit.com, navigate to r/DesiDeal or r/IndiaShopping,
 * click "Create Post" → "Link", paste the title and URL.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DEALS_FILE = process.env.DEALS_FILE || path.join(__dirname, '../data/deals.json');
const SUBREDDITS = ['DesiDeal', 'IndiaShopping', 'deals', 'frugalmalefashionINDIA'];

function buildRedditTitle(deal) {
  const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);
  const store = (deal.source || 'India').charAt(0).toUpperCase() + (deal.source || '').slice(1);
  const title = deal.title.slice(0, 100);
  return `[${store}] ${title} — ${deal.discount}% OFF, ₹${deal.discountedPrice} (Save ₹${savings})`;
}

function generatePost(deal, subreddit) {
  const title = buildRedditTitle(deal);
  const url = deal.affiliateLink || deal.productUrl;
  const savings = (deal.originalPrice || 0) - (deal.discountedPrice || 0);

  return `
═══════════════════════════════════════════════════
📍 r/${subreddit}
═══════════════════════════════════════════════════

📝 TITLE (copy this exactly):
${title}

🔗 URL (copy this):
${url}

💬 Suggested comment (optional):
Found this deal — ${deal.discount}% off on ${deal.source || 'store'}. 
Price dropped from ₹${deal.originalPrice} to ₹${deal.discountedPrice} (save ₹${savings}).
${deal.description ? 'Details: ' + deal.description.slice(0, 150) : ''}

✅ Posting tips:
• Keep title under 300 characters
• Use [Store] prefix — subreddit rule
• Post during 6-10 PM IST for max visibility
• Don't post more than 2x per day per subreddit

───────────────────────────────────────────────────
`;
}

function main() {
  if (!fs.existsSync(DEALS_FILE)) {
    console.error(`❌ deals.json not found at ${DEALS_FILE}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(DEALS_FILE, 'utf8');
  const deals = JSON.parse(raw);

  if (!Array.isArray(deals) || deals.length === 0) {
    console.error('❌ No deals found in deals.json');
    process.exit(1);
  }

  const bestOnly = process.argv.includes('--best');
  const dealsToPost = bestOnly ? [deals[0]] : deals.slice(0, 3);

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🚀 MANUAL REDDIT POST GENERATOR                          ║
║     (Copy-paste ready — no API needed)                       ║
╚══════════════════════════════════════════════════════════════╝
`);

  console.log(`Found ${deals.length} deals. Generating posts for top ${dealsToPost.length}...\n`);

  for (const sub of SUBREDDITS.slice(0, bestOnly ? 1 : 2)) {
    for (const deal of dealsToPost) {
      console.log(generatePost(deal, sub));
    }
  }

  console.log(`
📋 HOW TO POST:
1. Go to https://reddit.com/r/DesiDeal (or r/IndiaShopping)
2. Click "Create Post" → "Link"
3. Paste the TITLE and URL from above
4. Submit

⚠️  RULES:
• Max 2 posts per subreddit per day
• Post between 6-10 PM IST for best engagement
• Always use [Store] prefix in title

🔗 Quick links:
• r/DesiDeal: https://reddit.com/r/DesiDeal/submit
• r/IndiaShopping: https://reddit.com/r/IndiaShopping/submit
`);
}

main();
