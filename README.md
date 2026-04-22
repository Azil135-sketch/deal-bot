# Deal Bot India v4.0

**Real product links. Multi-affiliate networks. Autonomous distribution.**

Automated deal aggregation and broadcasting for Indian e-commerce. No more search-page redirects — users land on actual product pages.

---

## What's Fixed in v4

| Issue | v3 | v4 |
|-------|-----|-----|
| Product URLs | Search query URLs (`/s?k=...`) | **Real product URLs** via redirect resolution |
| Affiliate approval | Only Cuelinks (Amazon/Flipkart blocked) | **Cuelinks + EarnKaro + direct fallback** |
| Distribution | Just your Telegram channel | **Telegram + Reddit + Twitter + Discord + communities + SEO site** |
| Growth | Basic viral footer | **Milestone tracking, referral loops, cross-posting** |
| Twitter/Email | Stubs (not implemented) | **Twitter fully implemented** (install `twitter-api-v2`) |
| URL validation | Basic HEAD check | **Full redirect chain following + product page validation** |

---

## How It Works

```
1. SCRAPE → DealsMagnet RSS + Desidime + GrabOn
2. RESOLVE → Follow redirects to find REAL product URLs (not search pages)
3. AFFILIATE → Cuelinks (auto-approved) → EarnKaro → UTM fallback
4. QUALITY → AI scoring + stock check + duplicate filter
5. BROADCAST → Telegram + Reddit + Twitter + Discord + communities + SEO site
6. GROW → Milestone posts + viral footers + cross-promotion
```

---

## Quick Setup

### 1. Required Secrets (GitHub Actions)

| Secret | How to Get |
|--------|-----------|
| `TELEGRAM_BOT_TOKEN` | Message [@BotFather](https://t.me/BotFather) on Telegram |
| `TELEGRAM_CHAT_ID` | Create a channel, add your bot, get ID from [@userinfobot](https://t.me/userinfobot) |

### 2. Affiliate Networks (at least one)

**Option A: Cuelinks** (best commissions, instant approval for most stores)
- Sign up: [cuelinks.com](https://www.cuelinks.com)
- Get API key from dashboard
- Stores with **instant approval**: Myntra, Nykaa, Ajio, TataCliq, Meesho, Bewakoof, Healthkart, Lenskart, and 20+ more
- Amazon/Flipkart require approval (bot falls back to direct params)

**Option B: EarnKaro** (no approval needed at all)
- Sign up: [earnkaro.com](https://earnkaro.com)
- Add `EARNKARO_PUBLIC_TOKEN` to secrets
- Works for ALL stores including Amazon/Flipkart

**Option C: Direct Affiliate** (no third party)
- Amazon Associates: Set `AMAZON_ASSOCIATES_TAG`
- Flipkart Affiliate: Set `FLIPKART_AFFILIATE_ID`

### 3. Distribution (optional but recommended)

| Platform | Secret | How to Get |
|----------|--------|-----------|
| Reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → Create App → type: **script** |
| Discord | `DISCORD_WEBHOOK_URL` | Server Settings → Integrations → Webhooks |
| Twitter/X | `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_SECRET` | [developer.twitter.com](https://developer.twitter.com) |
| Telegram Communities | `TARGET_COMMUNITIES` | Comma-separated list like `@group1,@group2` |

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
├── affiliateRouter.js        # Multi-network affiliate routing
├── cuelinksAPI.js            # Cuelinks API integration
├── distributionNetwork.js    # Reddit, Twitter, Discord, communities
├── contentGenerator.js       # Platform-specific message formatting
├── broadcaster.js            # Sends to all channels
├── growthEngine.js           # Viral loops, milestones, bot commands
├── redditPoster.js           # Reddit OAuth + submission
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
1. Set up bot with your Telegram channel
2. Post consistently (6x daily automatic)
3. Enable GitHub Pages for free SEO traffic
4. Join 10+ Telegram deal groups, share 1-2 deals daily

### Week 3-4: Distribution
5. Set up Reddit auto-posting (r/DesiDeal, r/IndiaShopping)
6. Set up Discord webhooks in deal servers
7. Install `twitter-api-v2` for Twitter posting
8. Share channel invite link on WhatsApp groups

### Month 2+: Scale
9. As you hit 100+ members, apply for Amazon/Flipkart on Cuelinks
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
| `CUELINKS_API_KEY` | No* | Cuelinks API key |
| `EARNKARO_PUBLIC_TOKEN` | No* | EarnKaro public token |
| `REDDIT_CLIENT_ID` | No | For Reddit posting |
| `DISCORD_WEBHOOK_URL` | No | For Discord posting |
| `TARGET_COMMUNITIES` | No | Telegram groups for cross-post |
| `MIN_DISCOUNT_PERCENT` | No | Min discount (default: 15) |
| `MAX_DEALS_PER_RUN` | No | Max deals per run (default: 8) |
| `CHECK_STOCK` | No | Validate stock before posting (default: true) |

*At least one affiliate network recommended, but bot works with UTM fallback only.

---

## License

MIT
