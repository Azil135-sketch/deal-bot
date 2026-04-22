/**
 * Webhook Server Module
 * Starts a lightweight Express server to handle:
 * 1. Telegram bot webhook (incoming messages/commands)
 * 2. Health check endpoint
 *
 * Useful when hosted on Replit or any always-on server.
 * For serverless (GitHub Actions), this module is not needed.
 */

const http = require('http');
const logger = require('./logger');
const GrowthEngine = require('./growthEngine');

class WebhookServer {
  constructor() {
    this.port = process.env.PORT || 3000;
    this.growthEngine = new GrowthEngine();
    this.server = null;
  }

  start() {
    this.server = http.createServer(async (req, res) => {
      const url = req.url;
      const method = req.method;

      if (method === 'GET' && url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
      }

      if (method === 'POST' && url === '/webhook') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const update = JSON.parse(body);
            await this.growthEngine.handleUpdate(update);
          } catch (e) {
            logger.warn('Webhook parse error', { error: e.message });
          }
          res.writeHead(200);
          res.end('ok');
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    this.server.listen(this.port, () => {
      logger.info(`Webhook server listening on port ${this.port}`);
    });

    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('Webhook server stopped');
    }
  }
}

module.exports = WebhookServer;
