# Deal Bot India v4.0

**Real product links. Auto-approved affiliates. Autonomous distribution.**

Automated deal aggregation and broadcasting for Indian e-commerce. No more search-page redirects — users land on actual product pages.

---

## What's Fixed in v4

| Issue | v3 | v4 |
|-------|-----|-----|
| Product URLs | Search query URLs (`/s?k=...`) | **Real product URLs** via redirect resolution |
| Cuelinks approval | All stores attempted, Amazon/Flipkart fail silently | **Auto-approved stores only** — Myntra, Nykaa, Ajio, etc. work instantly |
| Affiliate fallback | UTM only (no commission) | **Direct affiliate IDs** (Amazon Associates, Flipkart Affiliate) |
| Distribution | Just your Telegram channel | **Telegram + Reddit + Discord + WhatsApp + SEO site** |
| Twitter | Stub (not implemented) | **Implemented** (requires `twitter-api-v2` install) |
| Reddit | Automated only | **Automated OR manual** (`node src/manualReddit.js` for copy-paste) |
| URL validation | Basic HEAD check | **Full redirect chain + product page validation** |

---

## How It Works

```
1. SCRAPE    → DealsMagnet RSS + Desidime + GrabOn
2. RESOLVE   → Follow redirects to find REAL product URLs
3. AFFILIATE → Cuelinks (auto-approved stores) → Direct IDs → UTM fallback
4. QUALITY   → AI scoring + stock check + duplicate filter
5. BROADCAST → Telegram + Discord + Reddit + WhatsApp links + SEO site
6. GROW      → Milestone posts + viral footers + cross-promotion
```

---

## Quick Setup

### 1. Required: Telegram

| Secret | How to Get |
|--------|-----------|
| `TELEGRAM_BOT_TOKEN` | Message [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Create channel, add bot, get ID from [@userinfobot](https://t.me/userinfobot) |

Add these to GitHub Secrets: Repo → Settings → Secrets → Actions.

### 2. Affiliate: Cuelinks (Recommended)

**This actually works.** Auto-approved stores get instant commission:

1. Sign up: [cuelinks.com](https://www.cuelinks.com)
2. Get API key from dashboard
3. Add `CUELINKS_API_KEY`, `CUELINKS_PUBLISHER_ID`, `CUELINKS_CHANNEL_ID` to secrets

**Stores with instant approval (no wait, no member count requirement):**
Myntra, Nykaa, Ajio, TataCliq, Meesho, Bewakoof, Croma, Healthkart, Lenskart, Netmeds, PharmEasy, 1mg, Snapdeal, FirstCry, Pepperfry, and 20+ more.

**Stores requiring manual approval:** Amazon, Flipkart — bot falls back to UTM/direct for these.

### 3. Direct Affiliate (Optional, if you have accounts)

| Program | Secret | Signup |
|---------|--------|--------|
| Amazon Associates | `AMAZON_ASSOCIATES_TAG` | [affiliate-program.amazon.in](https://affiliate-program.amazon.in) |
| Flipkart Affiliate | `FLIPKART_AFFILIATE_ID` | [affiliate.flipkart.com](https://affiliate.flipkart.com) |

### 4. Distribution (Optional but recommended)

| Platform | Secret | How to Get | Notes |
|----------|--------|-----------|-------|
| **Discord** | `DISCORD_WEBHOOK_URL` | Server Settings → Integrations → Webhooks | No approval needed |
| **Reddit (auto)** | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) | May not work for all accounts |
| **Reddit (manual)** | None — just run a script | `node src/manualReddit.js` | Copy-paste ready posts |
| **Twitter/X** | `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` | [developer.twitter.com](https://developer.twitter.com) | Requires `npm install twitter-api-v2` |

---

## Reddit Workaround

If `reddit.com/prefs/apps` doesn't work for your account (common issue), use the manual poster:

```bash
node src/manualReddit.js
```

This generates copy-paste ready posts for r/DesiDeal, r/IndiaShopping, etc. Just copy the title and URL, go to the subreddit, click "Create Post" → "Link", and paste.

For the best deal only:
```bash
node src/manualReddit.js --best
```

---

## Run Schedule

The bot runs **6x daily** via GitHub Actions:
- 8:00 AM IST — Morning deals
- 11:00 AM IST — Mid-morning
- 2:00 PM IST — Afternoon
- 5:00 PM IST — Evening commute
- 7:00 PM IST — Prime time
- 10:00 PM IST — Night owls

Also trigger manually from Actions tab anytime.

---

## Architecture

```
src/
├── index.js                  # Main orchestrator
├── fetchDeals.js             # Aggregates deals from all sources
├── dealScraper.js            # Scrapes + resolves REAL product URLs
├── dealIntelligence.js       # Quality scoring & filtering
├── dealQualityScorer.js      # Conversion prediction scoring
├── affiliateRouter.js        # Cuelinks + direct affiliate + UTM fallback
├── cuelinksAPI.js            # Cuelinks API integration
├── distributionNetwork.js    # Telegram communities, Discord, Reddit, Twitter
├── manualReddit.js           # Copy-paste Reddit post generator
├── contentGenerator.js       # Platform-specific message formatting
├── broadcaster.js            # Sends to all channels
├── growthEngine.js           # Viral loops, milestones, bot commands
├── redditPoster.js           # Reddit OAuth + submission (optional)
├── discordPoster.js          # Discord webhook embeds
├── dealSiteGenerator.js      # GitHub Pages SEO site
├── stockChecker.js           # Stock validation before posting
├── productImageFetcher.js    # OG image fetching with validation
├── validateDeals.js          # URL freshness checker
├── imageHandler.js           # Image download for Telegram photos
├── webhookServer.js          # Server mode for Replit/VPS
├── auditAttribution.js       # Commission tracking
└── logger.js                 # Structured logging
```

---

## Zero-Cost Growth Strategy

### Week 1-2: Foundation
1. Set up bot with Telegram channel
2. Bot auto-posts 6x daily
3. Enable GitHub Pages for free SEO traffic
4. Add 3-5 manual deals to `data/deals.json` with real product URLs (guaranteed commissions)

### Week 3-4: Distribution
5. Set up Discord webhooks in deal servers
6. Run `node src/manualReddit.js` and post to r/DesiDeal daily
7. Join 5-10 Telegram deal groups, share your best deal daily with channel link
8. Share channel invite link on WhatsApp groups

### Month 2+: Scale
9. Hit 100+ members, apply for Amazon/Flipkart on Cuelinks
10. Cross-promote with other growing deal channels
11. The bot auto-posts milestone celebrations (engagement boost)
12. SEO site brings passive Google traffic

---

## Environment Variables

See `.env.example` for full list. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_CHAT_ID` | Yes | Your channel ID |
| `CUELINKS_API_KEY` | No* | Cuelinks API (instant approval stores) |
| `AMAZON_ASSOCIATES_TAG` | No | Amazon Associates tag |
| `FLIPKART_AFFILIATE_ID` | No | Flipkart affiliate ID |
| `REDDIT_CLIENT_ID` | No | For automated Reddit posting (optional) |
| `DISCORD_WEBHOOK_URL` | No | For Discord posting (optional) |
| `MIN_DISCOUNT_PERCENT` | No | Min discount (default: 15) |
| `MAX_DEALS_PER_RUN` | No | Max deals per run (default: 8) |
| `CHECK_STOCK` | No | Validate stock before posting (default: true) |

*Cuelinks recommended but bot works with direct affiliate or UTM fallback only.

---

## What Makes Money

| Source | Setup | Commission |
|--------|-------|-----------|
| Cuelinks auto-approved | API key | Myntra, Nykaa, Ajio, etc. |
| Amazon Associates | Associates tag | Amazon.in purchases |
| Flipkart Affiliate | Affiliate ID | Flipkart purchases |
| UTM fallback | None | Tracking only, no commission |

**Realistic first-month earnings:** ₹500-2000 (Cuelinks auto-approved stores only)
**After Amazon/Flipkart approval:** ₹2000-5000+ (scales with channel growth)

---

## License

MIT
