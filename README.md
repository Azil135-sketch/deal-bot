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

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
