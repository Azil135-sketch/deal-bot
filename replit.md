# Deal Bot v2.0

## Overview
An automated deal aggregation and broadcasting system that fetches e-commerce deals, converts product URLs to affiliate links using the Cuelinks API, and broadcasts them to Telegram, Twitter, and Email channels.

## Architecture
- **Runtime**: Node.js 18 (CommonJS modules)
- **Package Manager**: npm
- **No frontend** — this is a pure backend automation bot

## Project Structure
```
deal-bot/
├── config/constants.js        # App-wide constants
├── data/deals.json            # Sample deal data feed
├── src/
│   ├── index.js               # Main orchestrator (pipeline entry point)
│   ├── fetchDeals.js          # Deal fetching from Amazon, Flipkart, Myntra
│   ├── contentGenerator.js    # Platform-specific content generation
│   ├── broadcaster.js         # Distributes deals to Telegram/Twitter/Email
│   ├── cuelinksAPI.js         # Cuelinks affiliate API wrapper
│   ├── dealIntelligence.js    # Deal scoring and quality filtering
│   ├── imageHandler.js        # Product image download and caching
│   ├── logger.js              # Custom logging utility
│   └── auditAttribution.js    # Affiliate attribution auditing
├── .env.example               # Template for required environment variables
└── package.json
```

## Key Dependencies
- `axios` — HTTP requests to Cuelinks API and image fetching
- `cheerio@1.0.0-rc.12` — HTML parsing (pinned for Node 18 compatibility)
- `dotenv` — Environment variable management

## Required Environment Variables
Copy `.env.example` to `.env` (or set via Replit Secrets) and fill in:
- `CUELINKS_API_KEY` — **Required** to run the pipeline
- `CUELINKS_PUBLISHER_ID` — Cuelinks publisher ID
- `CUELINKS_CHANNEL_ID` — Cuelinks channel ID
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — Optional Telegram broadcasting
- `DISTRIBUTION_WEBHOOKS` — Optional comma-separated webhook URLs

## Running
```bash
npm start           # Run full pipeline once
npm run fetch       # Only fetch deals
npm run generate    # Only generate content
npm run broadcast   # Only broadcast to channels
npm run audit:attribution  # Audit affiliate attribution
```

## Scheduling
Set `RUN_INTERVAL_MINUTES` env var to a positive number to run on a repeating interval.

## Notes
- cheerio is pinned to `1.0.0-rc.12` for Node 18 compatibility (v1.2+ requires Node 20+)
- Deals are stored in `./deals/` directory with deduplication via fingerprinting
- The workflow runs `npm start` in console mode — configure secrets before running
