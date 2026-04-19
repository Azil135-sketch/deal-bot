# Deal Bot v3.0

  Fully automated deal aggregation and Telegram broadcasting system for India.

  **What it does:**
  - Scrapes real deals from Desidime, GrabOn, and Coupondunia automatically (no API keys needed)
  - Converts product URLs to Cuelinks affiliate links (falls back to UTM tracking if not yet approved)
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
  5. Get your channel ID (e.g. `-1001234567890`) → `TELEGRAM_CHAT_ID`

  ### 2. Cuelinks (for affiliate commissions)

  - Register at https://publisher.cuelinks.com
  - Get API Key, Publisher ID, Channel ID
  - Add them to `.env`

  **Campaign approval status:**
  | Store | Approval needed? |
  |-------|-----------------|
  | Amazon | Yes — manual approval |
  | Flipkart | Yes — manual approval |
  | Myntra | Usually quick |
  | Ajio | Usually quick |
  | Nykaa | No — typically open |
  | TataCliq | Usually quick |
  | Meesho | **Not on Cuelinks** — UTM tags used instead |

  > While waiting for approval, the bot uses UTM tracking parameters so links still work and traffic is attributed. Set `STRICT_AFFILIATE_ONLY=false` (default) so deals post regardless.
  >
  > To see which campaigns are active: `npm run campaigns`

  ### 3. GitHub Actions (automated, free)

  Add these as **repository secrets** (Settings → Secrets → Actions):

  | Secret | Value |
  |--------|-------|
  | `TELEGRAM_BOT_TOKEN` | Your bot token |
  | `TELEGRAM_CHAT_ID` | Your channel ID |
  | `TELEGRAM_CHANNEL_USERNAME` | Your channel username (no @) |
  | `TELEGRAM_CHANNEL_INVITE_LINK` | Your invite link |
  | `CUELINKS_API_KEY` | (optional but recommended) |
  | `CUELINKS_PUBLISHER_ID` | (optional) |
  | `CUELINKS_CHANNEL_ID` | (optional) |

  The workflow runs **4 times daily** at IST: 8:30am, 2:30pm, 8:30pm, 2:30am.
  Enable it: Go to Actions tab → Enable workflows.

  ---

  ## How Deals Are Found

  **Automatic sources (no API keys needed):**
  - Desidime.com — India's largest deal community
  - GrabOn.in — Coupons and offers aggregator
  - Coupondunia.in — Online shopping deals

  **Manual curation (highest quality):**
  - Edit `data/deals.json` with your own hand-picked deals
  - Use the schema in `data/deals.sample.json`
  - Manual deals are always prioritized

  All deals pass through quality filters:
  - Minimum 20% discount
  - Minimum ₹200 savings
  - Minimum 3.5 star rating (when ratings are available)
  - No refurbished/used items
  - No news/blog content

  ---

  ## Affiliate Link Logic

  The bot tries affiliate links in this order:
  1. **Cuelinks** — if API key is set and the store campaign is active and approved
  2. **UTM tracking params** — appends `utm_source=dealbot` etc. for Myntra, Ajio, Nykaa, Meesho, TataCliq (links still work, just not paid affiliate)
  3. **Raw URL passthrough** — if nothing else works

  > **Why do links sometimes look "broken" or show "out of stock"?**
  > - If Cuelinks API key is not set or the campaign isn't approved, links redirect to the live product page directly
  > - "Out of stock" means the deal expired — not a broken link. Scraped deals are live deals that can sell out fast.
  > - Meesho links never go through Cuelinks (no campaign exists) — they use UTM tags only

  ---

  ## Growing Your Channel

  The bot embeds viral sharing prompts in every deal post automatically.

  **Manual growth strategies:**
  - Run `npm run growth` to set up bot commands (/start, /invite, /about)
  - Share your channel in these communities:
    - r/india (Reddit) — deal posts welcome
    - r/IndianGaming — tech deals especially
    - WhatsApp family/friend groups
    - College Telegram groups
    - Facebook "Online Shopping India" groups
  - Post 2-3 of your best deals manually to other Telegram deal groups
  - List your channel on: channelstore.org, telemetr.io, tgstat.com

  **Target Telegram communities to share in (join these first):**
  - @onlineshoppingindia
  - @techdeals_india
  - @dealsandcouponsindia
  - @desidime_deals

  ---

  ## Project Structure

  ```
  deal-bot/
  ├── src/
  │   ├── index.js              # Orchestrator — runs the full pipeline
  │   ├── fetchDeals.js         # Fetches + dedupes + filters deals
  │   ├── dealScraper.js        # Scrapes Desidime, GrabOn, Coupondunia
  │   ├── affiliateRouter.js    # Cuelinks + direct tracking fallback (uses cuelinksAPI.js)
  │   ├── cuelinksAPI.js        # Cuelinks v2 API wrapper (base: www.cuelinks.com/api/v2)
  │   ├── dealIntelligence.js   # Scores and selects top deals
  │   ├── contentGenerator.js   # Formats deal messages for Telegram/Twitter/email
  │   ├── broadcaster.js        # Sends to Telegram, webhooks, etc.
  │   ├── growthEngine.js       # Viral sharing, bot commands, milestones
  │   ├── webhookServer.js      # HTTP server for bot commands (server mode)
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
  npm run campaigns        # List active Cuelinks campaigns (requires CUELINKS_API_KEY)
  npm run growth           # Set up bot commands on Telegram
  npm run audit:attribution  # Audit affiliate attribution vs Cuelinks transactions
  ```

  ---

  ## Server Mode (Replit / VPS)

  For continuous operation:

  ```bash
  BOT_MODE=server RUN_INTERVAL_MINUTES=60 npm start
  ```

  This starts a webhook server (default port 3000) for bot commands AND runs the pipeline every 60 minutes.

  ---

  ## Known Limitations

  - **Meesho**: No Cuelinks affiliate campaign exists. Links use UTM params only — no commission.
  - **Amazon/Flipkart**: Require Cuelinks campaign approval. New publishers with low traffic or Telegram channels may not get approved immediately.
  - **Scraped deal links**: Link to the deal aggregator page (Desidime, GrabOn, etc.) which then redirects to the store. These work but are 1 redirect away from the product.
  - **Out-of-stock deals**: Scraped deals can expire quickly. The deduplication TTL (default 24h) prevents re-posting the same deal.

  ---

  ## License

  MIT
  