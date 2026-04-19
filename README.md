# deal-bot 🤖🛍️

  Automated Indian deal aggregator — posts affiliate deals to Telegram, Reddit, Discord, and a free GitHub Pages deal site. Runs 4x daily via GitHub Actions. Zero cost.

  ## What it does

  1. **Fetches deals** from your curated `data/deals.json` + optional web scrapers
  2. **Attaches Cuelinks affiliate links** (earn commission on every sale)  
  3. **Fetches product images** automatically via og:image
  4. **Broadcasts** to all configured channels in parallel:
     - 📱 **Telegram** — primary channel, supports multiple chat IDs
     - 👾 **Reddit** — r/DesiDeal + r/IndiaShopping (60K+ potential reach, free)
     - 💬 **Discord** — rich embed cards via webhook
     - 🌐 **GitHub Pages** — free indexed deal site (SEO traffic from Google)
     - 🔗 **Webhooks** — Zapier, Make, or custom automation
  5. **Deduplicates** — same deal won't post again for 12 hours

  ## Quick Start

  ### 1. Clone & install

  ```bash
  git clone https://github.com/Azil135-sketch/deal-bot.git
  cd deal-bot
  npm install
  ```

  ### 2. Configure environment

  ```bash
  cp .env.example .env
  # Fill in .env with your credentials
  ```

  ### 3. Add GitHub Actions secrets

  Go to: **Repo → Settings → Secrets → Actions → New repository secret**

  | Secret | Required | Where to get it |
  |---|---|---|
  | `TELEGRAM_BOT_TOKEN` | ✅ | @BotFather on Telegram |
  | `TELEGRAM_CHAT_ID` | ✅ | Use @userinfobot, supports multiple IDs comma-separated |
  | `CUELINKS_API_KEY` | Recommended | cuelinks.com (free signup) |
  | `CUELINKS_PUBLISHER_ID` | Recommended | cuelinks.com dashboard |
  | `REDDIT_CLIENT_ID` | Optional | reddit.com/prefs/apps (free) |
  | `REDDIT_CLIENT_SECRET` | Optional | reddit.com/prefs/apps (free) |
  | `REDDIT_USERNAME` | Optional | Your Reddit username |
  | `REDDIT_PASSWORD` | Optional | Your Reddit password |
  | `DISCORD_WEBHOOK_URL` | Optional | Channel Settings → Integrations → Webhooks |

  ### 4. Enable GitHub Pages (for the free deal site)

  1. Go to **Repo → Settings → Pages**
  2. Source: **Deploy from a branch**
  3. Branch: **gh-pages** → folder **/ (root)**
  4. Save — your deal site will be at `https://azil135-sketch.github.io/deal-bot/`

  ### 5. Run manually or wait for cron

  The bot runs automatically at 8:30am, 2:30pm, 8:30pm, and 2:30am IST via GitHub Actions.

  Manual trigger: **Repo → Actions → Deal Bot Automation → Run workflow**

  ```bash
  # Local test run
  npm start
  ```

  ## Adding Deals

  Edit `data/deals.json` — add any product from Nykaa, Myntra, Ajio, TataCliq, etc:

  ```json
  {
    "id": "your-unique-id",
    "source": "nykaa",
    "title": "Product Name",
    "originalPrice": 999,
    "discountedPrice": 499,
    "discount": 50,
    "rating": 4.3,
    "productUrl": "https://www.nykaa.com/...",
    "imageUrl": null
  }
  ```

  `imageUrl: null` is fine — the bot fetches og:image from the product page automatically.

  ## Monetization

  - **Cuelinks** — earns commission when someone buys via your affiliate link. Best stores to add first: Nykaa, Myntra, Ajio, TataCliq (fast approval).
  - **Telegram members** → more clicks → more commissions
  - **Reddit/Discord** → builds audience without ad spend
  - **GitHub Pages** → passive Google traffic over time

  ## File Structure

  ```
  src/
    broadcaster.js         — sends to all channels
    fetchDeals.js          — aggregates + processes deals
    affiliateRouter.js     — routes URLs through Cuelinks
    cuelinksAPI.js         — Cuelinks API client
    contentGenerator.js    — writes deal messages
    dealScraper.js         — optional web scraping
    dealIntelligence.js    — quality scoring + filtering
    growthEngine.js        — viral footer / CTA generation
    productImageFetcher.js — fetches og:image from product pages
    redditPoster.js        — posts to r/DesiDeal + r/IndiaShopping
    discordPoster.js       — Discord webhook rich embeds
    dealSiteGenerator.js   — publishes HTML deal site to gh-pages
    imageHandler.js        — downloads images for Telegram
    logger.js              — logging utility
  data/
    deals.json             — your curated deals list (edit this!)
  .github/workflows/
    deal-bot-cron.yml      — GitHub Actions automation
  ```

  ## License

  MIT
  