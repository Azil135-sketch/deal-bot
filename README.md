# Deal Bot v3.0

Fully automated deal aggregation and Telegram broadcasting system for India.

**What it does:**
- Scrapes real deals from Desidime, Mydala, and GrabOn automatically (no API keys needed)
- Converts product URLs to Cuelinks affiliate links (falls back to direct tracking if not approved)
- Sends deal posts to your Telegram channel with viral sharing prompts
- Runs on GitHub Actions for free — 4x daily, zero infrastructure cost

---

## Quick Start

```bash
git clone https://github.com/Azil135-sketch/deal-bot.git
cd deal-bot
npm install
cp .env.example .env
# Edit .env — at minimum set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
npm start
```

---

## Setup Guide

### 1. Create your Telegram Bot

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`, follow prompts
3. Copy the **bot token** → `TELEGRAM_BOT_TOKEN`
4. Add the bot as admin to your channel
5. Get your channel ID → `TELEGRAM_CHAT_ID`

### 2. Cuelinks (for affiliate commissions)

- Register at https://publisher.cuelinks.com
- Get API Key, Publisher ID, Channel ID
- Add them to `.env`
- **Note:** Amazon/Flipkart may need approval. While waiting, the bot uses direct tracking links for Myntra, Ajio, Nykaa, Meesho (these typically approve faster).
- To see which campaigns are open: `npm run campaigns`

### 3. GitHub Actions (automated, free)

Add these as **repository secrets** (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `TELEGRAM_BOT_TOKEN` | Your bot token |
| `TELEGRAM_CHAT_ID` | Your channel ID |
| `TELEGRAM_CHANNEL_USERNAME` | Your channel username (no @) |
| `TELEGRAM_CHANNEL_INVITE_LINK` | Your invite link |
| `CUELINKS_API_KEY` | (optional) |
| `CUELINKS_PUBLISHER_ID` | (optional) |
| `CUELINKS_CHANNEL_ID` | (optional) |

The workflow runs **4 times daily** at IST: 8:30am, 2:30pm, 8:30pm, 2:30am.
Enable it: Go to Actions tab → Enable workflows.

---

## How Deals Are Found

**Automatic sources (no keys needed):**
- Desidime.com — India's largest deal community
- Mydala.com — Online shopping deals
- GrabOn.in — Coupons and offers aggregator

**Manual curation (highest quality):**
- Edit `data/deals.json` with your own hand-picked deals
- Use the schema in `data/deals.sample.json`
- Manual deals are always prioritized

All deals pass through quality filters:
- Minimum 20% discount
- Minimum ₹200 savings
- Minimum 3.5 star rating
- No refurbished/used items
- No news/blog content

---

## Affiliate Link Logic

The bot tries affiliate links in this order:
1. **Cuelinks** — if API key is set and the store campaign is active
2. **Direct tracking params** — UTM/ref parameters for Myntra, Ajio, Nykaa, Meesho
3. **Raw URL passthrough** — if nothing else works

Set `STRICT_AFFILIATE_ONLY=false` (default) so deals still post while waiting for Cuelinks campaign approvals.

---

## Growing Your Channel

The bot embeds viral sharing prompts in every deal post automatically.

**Manual growth strategies:**
- Run `npm run growth` to set up bot commands (users can /start, /invite, /about)
- Share your channel in these communities:
  - r/india (Reddit) — deal posts welcome
  - r/IndianGaming, r/IndianStockMarket — niche audiences
  - WhatsApp family/friend groups
  - College Telegram groups
  - Facebook "Online Shopping India" groups
- Post 2-3 of your best deals manually to other Telegram deal groups
- List your channel on: channelstore.org, telemetr.io, tgstat.com

**Target communities to share in (join these first):**
- @AmazonIndiaDeals
- @onlineshoppingindia
- @techdeals_india
- @dealsandcouponsindia

---

## Project Structure

```
deal-bot/
├── src/
│   ├── index.js              # Orchestrator — runs the full pipeline
│   ├── fetchDeals.js         # Fetches + dedupes + filters deals
│   ├── dealScraper.js        # Scrapes Desidime, Mydala, GrabOn
│   ├── affiliateRouter.js    # Cuelinks + direct tracking fallback
│   ├── dealIntelligence.js   # Scores and selects top deals
│   ├── contentGenerator.js   # Formats deal messages
│   ├── broadcaster.js        # Sends to Telegram, webhooks, etc.
│   ├── growthEngine.js       # Viral sharing, bot commands, milestones
│   ├── webhookServer.js      # HTTP server for bot commands (server mode)
│   ├── cuelinksAPI.js        # Cuelinks API wrapper
│   ├── imageHandler.js       # Product image download + cache
│   ├── auditAttribution.js   # Attribution audit vs Cuelinks transactions
│   └── logger.js             # Logging
├── config/
│   └── constants.js          # App constants
├── data/
│   ├── deals.json            # Hand-curated deals (edit this!)
│   └── deals.sample.json     # Schema reference
├── .github/workflows/
│   └── deal-bot-cron.yml     # GitHub Actions cron (4x daily)
├── .env.example              # Config template
└── package.json
```

---

## Commands

```bash
npm start                # Run full pipeline (fetch → affiliate → broadcast)
npm run fetch            # Fetch and process deals only
npm run scrape           # Test scrapers only
npm run broadcast        # Broadcast to Telegram only
npm run campaigns        # List open Cuelinks campaigns
npm run growth           # Set up bot commands on Telegram
npm run audit:attribution  # Audit affiliate attribution vs Cuelinks
```

---

## Server Mode (Replit / VPS)

For continuous operation:

```bash
BOT_MODE=server RUN_INTERVAL_MINUTES=60 npm start
```

This starts a webhook server (default port 3000) for bot commands AND runs the pipeline every 60 minutes.

Set `TELEGRAM_CHANNEL_INVITE_LINK` in `.env` for bot commands to include the invite link.

---

## License

MIT
