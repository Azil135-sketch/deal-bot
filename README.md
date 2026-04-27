# Deal Bot India v4.1 — Autonomous Deal Distribution Engine

**Built for zero members, zero budget, maximum reach.**

This bot finds real deals from Indian e-commerce stores, verifies them, generates affiliate links, and autonomously distributes them across Telegram, Reddit, Discord, GitHub Pages (SEO), WhatsApp, and more.

---

## What v4.1 Fixed (The Real Stuff)

### 1. Broken Links = FIXED
- **Root cause:** The scraper was giving up too easily and falling back to search URLs (`myntra.com/search?q=...`) instead of real product pages.
- **Fix:** Rewrote URL resolution engine with deeper redirect following, better HTML parsing of "Go to Store" buttons, and **search URLs are now SKIPPED entirely** — no more useless search redirects.
- **Root cause:** `cuelinksAPI.js` was completely missing from the repo.
- **Fix:** Built a real Cuelinks API v2 integration that auto-generates affiliate links for **auto-approved stores** (Myntra, Nykaa, Ajio, Meesho, Croma, etc.) and gracefully falls back to direct/UTM for non-approved stores (Amazon, Flipkart).

### 2. Missing Critical File = FIXED
- **Root cause:** `fetchDeals.js` — the core orchestrator that ties scraping → quality scoring → affiliate links → stock checking → image fetching — was **completely missing**.
- **Fix:** Built `fetchDeals.js` from scratch. The bot now actually runs end-to-end.

### 3. Fake Discount Detection = NEW
- **Root cause:** Many "80% off" deals inflate the MRP just to show high discounts.
- **Fix:** Added `priceTracker.js` that records price history per product. If today's "original price" is 30%+ higher than the historical median, the deal is **flagged as fake and rejected**.

### 4. Price Drop Alerts = NEW
- If a tracked product drops 10%+ below its 7-day average, the bot marks it as a **Price Drop Alert** and boosts its quality score.

### 5. Multi-Platform Autonomous Distribution = NEW
- `socialShareGenerator.js` — generates ready-to-post content for Reddit, WhatsApp, Quora, Facebook, Pinterest, Blogger, Medium, Email newsletters, and Twitter.
- `referralTracker.js` — tracks subscriber growth and generates **per-platform tracked invite links** so you know which channel brings members.
- GitHub Pages site now includes **JSON-LD structured data**, **sitemap.xml**, **RSS feed**, **OpenGraph**, and **Twitter Cards** for Google SEO traffic.

---

## Architecture

```
Scrape (RSS + HTML)
  ↓
Deduplicate
  ↓
DealIntelligence (category filters, validation)
  ↓
DealQualityScorer (score & rank)
  ↓
AffiliateRouter (Cuelinks API v2 → auto-approved stores)
  ↓
StockChecker (HEAD request to verify in-stock)
  ↓
PriceTracker (fake discount removal + price drop alerts)
  ↓
ProductImageFetcher (images for rich posts)
  ↓
ContentGenerator (human-like messages)
  ↓
Broadcaster
  ├── Telegram (primary channel + photo support)
  ├── DistributionNetwork (Reddit, Discord, Twitter, communities)
  ├── DealSiteGenerator (GitHub Pages SEO site + sitemap + RSS)
  └── GrowthEngine (milestone posts, viral footer, invite tracking)
```

---

## Your Action Plan (Do This In Order)

### STEP 1: Set Up Your Telegram Channel (30 mins)

1. Open Telegram, search `@BotFather`, start it.
2. Send `/newbot`, give it a name and username (e.g., `mydeals_bot`).
3. Copy the **HTTP API token** — it looks like `123456:ABC-DEF...`
4. Create a new **Channel** (not group). Name it something searchable like `Indian Deals Daily` or `Deal Hunter India`.
5. Add your bot as an **Admin** of the channel with "Post Messages" permission.
6. Go to channel info, copy the **Invite Link** (looks like `https://t.me/+AbCdEfGhIjK`).
7. Forward any message from your channel to `@userinfobot` to get your `chat_id`. It looks like `-1001234567890`.

### STEP 2: Configure GitHub Secrets (10 mins)

Go to your repo → Settings → Secrets and variables → Actions → **New repository secret**.

Add these **required** secrets:

| Secret | Value |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_CHAT_ID` | `-1001234567890` |
| `TELEGRAM_CHANNEL_USERNAME` | Your channel username without `@` |
| `TELEGRAM_CHANNEL_INVITE_LINK` | `https://t.me/+...` |

Add these **optional but highly recommended** secrets:

| Secret | Why |
|--------|-----|
| `CUELINKS_API_KEY` | Free money. Sign up at [cuelinks.com](https://www.cuelinks.com), get API key from dashboard. Works instantly for Myntra, Nykaa, Ajio, etc. |
| `GITHUB_TOKEN` | Already exists automatically. Used to publish SEO site. |

Add these **optional** secrets if you want extra distribution:

| Secret | Why |
|--------|-----|
| `DISCORD_WEBHOOK_URL` | Post to Discord servers. Get webhook URL from any Discord channel settings → Integrations → Webhooks. |
| `REDDIT_CLIENT_ID` | Auto-post to r/DesiDeal, r/IndiaShopping. Create app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps). |
| `REDDIT_CLIENT_SECRET` | Same as above |
| `REDDIT_USERNAME` | Your Reddit username |
| `REDDIT_PASSWORD` | Your Reddit password |

### STEP 3: Enable GitHub Pages (5 mins)

1. Repo → Settings → Pages
2. Source: Deploy from a branch
3. Branch: `gh-pages` / root
4. Click Save

The bot will auto-create the `gh-pages` branch on its first run and push your SEO deal site there.

Your site will be at: `https://YOURUSERNAME.github.io/deal-bot/`

### STEP 4: Add Real Deals to `data/deals.json` (20 mins)

This file is your **manual curation layer**. The bot posts these first (they're trusted), then scrapes for more.

1. Open `data/deals.json`
2. Replace the sample deals with **real, current deals** from Myntra, Nykaa, etc.
3. For each deal, paste the **real product URL** (not a search page).
4. Set real prices and discounts.
5. Commit the file.

**Why this matters:** If the scrapers fail or return no deals, your manual deals still get posted. This is your safety net.

### STEP 5: Run the Bot (5 mins)

**Option A: GitHub Actions (Fully Autonomous — Recommended)**

The workflow already runs 6x daily. Just go to:

- Repo → Actions → "Deal Bot v4 — Daily Run" → **Run workflow**

**Option B: Run Locally (For Testing)**

```bash
# 1. Clone and enter repo
cd deal-bot

# 2. Copy env file
cp .env.example .env
# Edit .env with your real values

# 3. Install dependencies
npm install

# 4. Run full pipeline
npm start
```

### STEP 6: Manual Distribution (Do This Daily — 15 mins)

The bot automates Telegram, Discord, Reddit, and your SEO site. **But you need to manually seed growth on these zero-cost channels:**

**WhatsApp (Your Personal Network)**
- Open `deals/whatsapp_broadcast.txt` (generated on each run) or use the share links.
- Copy the message and broadcast to your personal WhatsApp contacts.
- Don't spam groups — use your Status instead.

**Reddit (If auto-post fails)**
```bash
npm run reddit
```
This outputs ready-to-paste titles and links for r/DesiDeal and r/IndiaShopping.

**Quora**
- Search Quora for: "Where can I find deals on [product category]?"
- Paste the Quora answer text the bot generates (in logs or use `socialShareGenerator`).
- Include your Telegram channel link at the end.

**Facebook Groups**
- Join groups: "Indian Deals & Offers", "Online Shopping Deals India", "Desi Deals"
- Copy the Facebook post text from the bot's output.
- Post 1-2x daily max.

**Pinterest**
- Create pins using the deal images and your affiliate links.
- Pinterest is huge for shopping traffic — completely free.

### STEP 7: Track Growth (Weekly)

The bot auto-tracks your Telegram subscriber count every run. Check:

```bash
cat data/subscriber_history.json
```

When you hit milestones (10, 50, 100, 500, 1000), the bot auto-posts celebration messages to drive more invites.

---

## Understanding Auto-Approved vs Approval-Required Stores

| Store | Cuelinks Status | Fallback Strategy |
|-------|-----------------|-------------------|
| Myntra | ✅ Auto-approved | Native Cuelinks link |
| Nykaa | ✅ Auto-approved | Native Cuelinks link |
| Ajio | ✅ Auto-approved | Native Cuelinks link |
| TataCliq | ✅ Auto-approved | Native Cuelinks link |
| Croma | ✅ Auto-approved | Native Cuelinks link |
| Meesho | ✅ Auto-approved | Native Cuelinks link |
| Healthkart | ✅ Auto-approved | Native Cuelinks link |
| Netmeds | ✅ Auto-approved | Native Cuelinks link |
| Amazon | ❌ Approval required | Direct URL + UTM |
| Flipkart | ❌ Approval required | Direct URL + UTM |

**What this means:**
- If you don't have Cuelinks approval for Amazon/Flipkart, the bot still posts the deal — but with a direct product URL instead of an affiliate link.
- **You still earn from Myntra, Nykaa, Ajio, etc. immediately** with no approval needed.

---

## Commands

```bash
npm start              # Run full pipeline (scrape → process → broadcast)
npm run scrape         # Test scraping only (outputs JSON)
npm run reddit         # Generate manual Reddit posts
npm run validate       # Validate manual deals in data/deals.json
npm run validate:flag-only   # Validate without removing
```

---

## Environment Variables

See `.env.example` for all options.

---

## File Structure

```
src/
  index.js              # Main orchestrator
  fetchDeals.js         # MISSING FILE — NOW FIXED. Scrapes + quality + affiliate + stock
  cuelinksAPI.js        # MISSING FILE — NOW FIXED. Real Cuelinks API v2
  dealScraper.js        # FIXED. Better URL resolution, no search fallbacks
  affiliateRouter.js    # FIXED. Better redirect following
  dealIntelligence.js   # Deal validation + quality filtering
  dealQualityScorer.js  # Score & rank deals
  stockChecker.js       # Verify in-stock status
  productImageFetcher.js # Fetch product images
  contentGenerator.js   # Human-like Telegram messages
  broadcaster.js        # Send to Telegram + distribution network
  distributionNetwork.js # Reddit, Discord, Twitter, communities
  dealSiteGenerator.js  # SEO site with structured data + sitemap + RSS
  growthEngine.js       # Viral mechanics + milestone posts
  socialShareGenerator.js # Content for WhatsApp, Quora, FB, Pinterest, etc.
  priceTracker.js       # Price history + fake discount detection
  referralTracker.js    # Subscriber tracking + invite links
  validateDeals.js      # Validate manual deals
  imageHandler.js       # Image processing
  logger.js             # Logging
  auditAttribution.js   # Commission audit
  redditPoster.js       # Reddit API poster
  discordPoster.js      # Discord webhook poster
  manualReddit.js       # Manual Reddit post generator
  webhookServer.js      # Webhook server

data/
  deals.json            # Your manual deals
  price_history.json    # Auto-generated price history
  subscriber_history.json # Auto-generated subscriber history
```

---

## Troubleshooting

**"No deals found"**
- Check that `data/deals.json` has valid deals.
- Run `npm run scrape` to see if scrapers are working.
- If scrapers return 403, wait a few hours (rate limit).

**"Links still redirect to search"**
- This should be fixed in v4.1. If you see it, the scraper couldn't resolve the real URL. The deal is now **skipped** instead of posted with a search link.

**"Telegram messages not sending"**
- Make sure the bot is an admin in the channel.
- Check `TELEGRAM_CHAT_ID` starts with `-100`.

**"Cuelinks links not generating"**
- Check `CUELINKS_API_KEY` is correct.
- For non-approved stores, the bot falls back to direct URLs. That's expected.

**"GitHub Pages site not updating"**
- Make sure Pages is enabled in repo settings.
- Check Actions logs for "Deal site published" message.

---

## Monetization Path

1. **Immediate:** Cuelinks auto-approved stores (Myntra, Nykaa, Ajio, etc.) — you earn from day 1.
2. **Week 1-2:** Grow Telegram to 100+ via manual Reddit, Quora, WhatsApp shares.
3. **Month 1:** Apply for Amazon/Flipkart affiliate + Cuelinks approval for them.
4. **Month 2+:** SEO traffic from GitHub Pages starts bringing passive clicks.

---

## License

MIT

---

**Built for the grind. No budget, no audience, no problem.**
