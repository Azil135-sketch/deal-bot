/**
 * Image Handler Module
 * Handles downloading and caching product images from source URLs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const IMAGE_DIR = process.env.IMAGE_DIR || './deals/images';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const IMAGE_TIMEOUT = 10000; // 10 seconds

class ImageHandler {
  constructor() {
    this.imageDir = IMAGE_DIR;
    this.imageCache = new Map(); // In-memory cache for image URLs
    this._ensureImageDirectory();
  }

  /**
   * Ensure the image directory exists
   * @private
   */
  _ensureImageDirectory() {
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
      logger.info(`Created image directory: ${this.imageDir}`);
    }
  }

  /**
   * Download and cache an image from a URL
   * @param {string} imageUrl - The image URL to download
   * @param {string} productId - Unique identifier for the product (for filename)
   * @returns {Promise<Object>} - Image metadata { filename, path, url }
   */
  async downloadImage(imageUrl, productId) {
    if (!imageUrl) {
      logger.warn('Image URL is empty');
      return null;
    }

    try {
      // Check if image is already cached
      const cacheKey = this._generateCacheKey(imageUrl);
      if (this.imageCache.has(cacheKey)) {
        logger.debug(`Using cached image for ${imageUrl}`);
        return this.imageCache.get(cacheKey);
      }

      logger.debug(`Downloading image from ${imageUrl}`);

      // Download the image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: IMAGE_TIMEOUT,
        maxContentLength: MAX_IMAGE_SIZE,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // Validate content type
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.startsWith('image/')) {
        logger.warn(`Invalid content type for image: ${contentType}`);
        return null;
      }

      // Determine file extension
      const extension = this._getExtensionFromContentType(contentType);
      const filename = `${productId}-${Date.now()}${extension}`;
      const filepath = path.join(this.imageDir, filename);

      // Write image to disk
      fs.writeFileSync(filepath, response.data);
      logger.info(`Image saved: ${filename}`);

      // Create metadata object
      const imageMetadata = {
        filename,
        path: filepath,
        url: imageUrl,
        size: response.data.length,
        contentType
      };

      // Cache the metadata
      this.imageCache.set(cacheKey, imageMetadata);

      return imageMetadata;
    } catch (error) {
      logger.warn(`Failed to download image from ${imageUrl}`, {
        error: error.message
      });
      return null;
    }
  }

  /**
   * Extract image URL from HTML content
   * @param {string} htmlContent - HTML content to parse
   * @returns {string|null} - First image URL found or null
   */
  extractImageUrl(htmlContent) {
    if (!htmlContent) {
      return null;
    }

    try {
      // Look for og:image meta tag (most reliable)
      const ogImageMatch = htmlContent.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogImageMatch && ogImageMatch[1]) {
        return ogImageMatch[1];
      }

      // Look for first img tag
      const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        return imgMatch[1];
      }

      return null;
    } catch (error) {
      logger.warn('Failed to extract image URL from HTML', { error: error.message });
      return null;
    }
  }

  /**
   * Get extension from content type
   * @private
   */
  _getExtensionFromContentType(contentType) {
    const typeMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg'
    };

    return typeMap[contentType] || '.jpg';
  }

  /**
   * Generate cache key from URL
   * @private
   */
  _generateCacheKey(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * Clear old images (older than specified days)
   * @param {number} daysOld - Delete images older than this many days
   */
  clearOldImages(daysOld = 7) {
    try {
      const now = Date.now();
      const cutoffTime = now - (daysOld * 24 * 60 * 60 * 1000);

      const files = fs.readdirSync(this.imageDir);
      let deletedCount = 0;

      files.forEach(file => {
        const filepath = path.join(this.imageDir, file);
        const stats = fs.statSync(filepath);

        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filepath);
          deletedCount++;
          logger.debug(`Deleted old image: ${file}`);
        }
      });

      if (deletedCount > 0) {
        logger.info(`Deleted ${deletedCount} old images`);
      }
    } catch (error) {
      logger.warn('Failed to clear old images', { error: error.message });
    }
  }
}

module.exports = ImageHandler;
