# Deal Bot v2.0

A complete rebuild of the Deal Bot system with proper Cuelinks API integration and product image handling.

## Features

- **Cuelinks API Integration**: Generates valid affiliate links using the Cuelinks v2 API
- **Product Image Extraction**: Automatically fetches and caches product images from source URLs
- **Multi-Source Support**: Aggregates deals from multiple e-commerce platforms
- **Modular Architecture**: Clean, maintainable codebase with separated concerns
- **Error Handling**: Robust error handling and retry logic
- **Logging**: Comprehensive logging for debugging and monitoring

## Installation

1. Clone the repository:
```bash
git clone https://github.com/Azil135-sketch/deal-bot.git
cd deal-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Cuelinks API credentials
```

## Configuration

### Required Environment Variables

- `CUELINKS_API_KEY`: Your Cuelinks API key (Bearer token)
- `CUELINKS_PUBLISHER_ID`: Your Cuelinks publisher ID
- `CUELINKS_CHANNEL_ID`: Your Cuelinks channel ID

### Optional Environment Variables

- `DEAL_SOURCES`: Comma-separated list of deal sources (default: amazon,flipkart,myntra)
- `OUTPUT_DIR`: Directory to store generated deals (default: ./deals)
- `IMAGE_DIR`: Directory to store product images (default: ./deals/images)
- `LOG_LEVEL`: Logging level (default: info)

## Usage

### Fetch Deals
```bash
npm run fetch
```

### Generate Content
```bash
npm run generate
```

### Broadcast Deals
```bash
npm run broadcast
```

### Run Full Pipeline
```bash
npm start
```

## Project Structure

```
deal-bot/
├── src/
│   ├── index.js                 # Main entry point
│   ├── fetchDeals.js            # Deal fetching logic
│   ├── contentGenerator.js      # Content generation
│   ├── broadcaster.js           # Broadcasting logic
│   ├── cuelinksAPI.js           # Cuelinks API integration
│   ├── imageHandler.js          # Product image handling
│   └── logger.js                # Logging utility
├── config/
│   └── constants.js             # Application constants
├── .env.example                 # Environment variables template
├── package.json                 # Project dependencies
└── README.md                    # This file
```

## API Integration

### Cuelinks Link Generation

The bot uses the Cuelinks v2 API to generate affiliate links:

```javascript
POST https://api.cuelinks.com/v2/links.json
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "source_url": "https://example.com/product",
  "subid": "deal-bot-v2",
  "channel_id": "your_channel_id"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "link": "https://cuelinks.com/l/xxxxx",
    "source_url": "https://example.com/product"
  }
}
```

## Image Handling

Product images are automatically extracted from source URLs and cached locally:

- Images are downloaded and stored in `IMAGE_DIR`
- Duplicate images are detected and reused
- Failed image downloads do not block the deal processing
- Image URLs are included in the generated content

## Error Handling

The bot implements comprehensive error handling:

- Retry logic for failed API calls
- Graceful degradation when images cannot be fetched
- Detailed error logging for debugging
- Validation of configuration and input data

## Logging

Logs are written to the console and can be configured via `LOG_LEVEL`:

- `error`: Only errors
- `warn`: Warnings and errors
- `info`: General information, warnings, and errors (default)
- `debug`: Detailed debugging information


## Production Setup (Affiliate + Automation)

### 1) Verify Cuelinks attribution (no "hole in pocket")
- Every generated affiliate link now stores `{ dealId, sourceUrl, affiliateLink, subId, generatedAt }` in `./deals/affiliate-attribution-log.json`.
- Run attribution audit against Cuelinks transactions:
  ```bash
  npm run audit:attribution
  ```
- This compares stored subIds with recent transactions to show matched vs unmatched attribution.

### 2) Prevent repeated deals
- The bot stores processed deal fingerprints in `./deals/processed-deals.json`.
- Duplicate deals in a run and previously processed deals are automatically skipped.
- Only successfully affiliated deals are marked as processed to avoid losing retries when Cuelinks fails.
- `PROCESSED_DEAL_TTL_HOURS` controls when an old deal can be posted again (default: `24`). Set `0` to block repeats indefinitely.

### 3) Upgrade deal quality with intelligence filters
- `src/dealIntelligence.js` scores deals using weighted factors:
  - discount percentage
  - absolute savings
  - rating and review depth
  - optional trend score
- Non-commerce/news-like inputs are rejected before scoring (invalid URLs, article/news paths, non-product titles, unsupported host domains).
- Hard quality floors are configurable via:
  - `MIN_DISCOUNT_PERCENT`
  - `MIN_SAVINGS_AMOUNT`
  - `MIN_RATING`
  - `BLOCKED_KEYWORDS`
  - `ALLOWED_DEAL_DOMAINS`
  - `REJECT_NEWS_CONTENT`
  - `MAX_DEALS_PER_RUN`

### 4) Feed real deals
- Set `DEALS_FILE=./data/deals.json` and provide a JSON array of deals.
- A sample schema is available at `data/deals.sample.json`.

### 5) Automation
- `RUN_INTERVAL_MINUTES` can run the bot continuously in one process (`0` = one-shot).
- GitHub Actions workflow exists at `.github/workflows/deal-bot-cron.yml` (hourly + manual dispatch).
- Add repository secrets for Cuelinks and Telegram before enabling production schedules.

### 6) Distribution beyond Telegram
- Telegram sends real messages through Bot API when credentials are set.
- `DISTRIBUTION_WEBHOOKS` supports comma-separated webhook URLs (Zapier/Make/custom) for outsourced amplification pipelines.

### 7) Better persuasion content
- Content generation now uses decision psychology structure:
  - value anchor
  - social proof signal
  - urgency framing
  - low-friction decision cue

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
