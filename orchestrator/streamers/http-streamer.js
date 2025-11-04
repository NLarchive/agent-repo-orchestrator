/**
 * HTTP Streamer - Polls an HTTP endpoint for transaction data
 * 
 * Configuration:
 *   - url: HTTP endpoint URL (default: 'http://localhost:8080/transactions')
 *   - intervalMs: poll interval in milliseconds (default: 5000)
 *   - timeoutMs: request timeout in milliseconds (default: 10000)
 *   - authToken: optional bearer token for authentication
 *   - method: HTTP method (default: 'GET')
 *   - bodyField: JSON field containing transaction array (default: 'transactions')
 * 
 * Environment variables:
 *   - HTTP_URL: override url
 *   - HTTP_INTERVAL_MS: override intervalMs
 *   - HTTP_TIMEOUT_MS: override timeoutMs
 *   - HTTP_AUTH_TOKEN: override authToken
 */

const EventEmitter = require('events');
const https = require('https');
const http = require('http');

class HttpStreamer extends EventEmitter {
  async init(config = {}) {
    this.config = Object.assign({
      url: process.env.HTTP_URL || 'http://localhost:8080/transactions',
      intervalMs: parseInt(process.env.HTTP_INTERVAL_MS) || 5000,
      timeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS) || 10000,
      authToken: process.env.HTTP_AUTH_TOKEN || undefined,
      method: 'GET',
      bodyField: 'transactions'
    }, config);

    this.running = false;
    this.timer = null;
    this.messageCount = 0;
    this.errorCount = 0;
    this.lastMessageTime = null;
    this.lastETag = null; // For future caching support

    console.log(`[HttpStreamer] Initialized with config:`, {
      url: this.config.url,
      intervalMs: this.config.intervalMs,
      method: this.config.method
    });
  }

  async start() {
    if (this.running) {
      console.warn('[HttpStreamer] Already running');
      return;
    }

    this.running = true;
    console.log(`[HttpStreamer] Started polling ${this.config.url}`);
    this.emit('health', { status: 'healthy', details: { polling: true } });

    // Poll immediately
    this._poll();

    // Set up interval
    this.timer = setInterval(() => {
      this._poll();
    }, this.config.intervalMs);
  }

  async stop() {
    if (!this.running) {
      console.warn('[HttpStreamer] Not running');
      return;
    }

    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log(`[HttpStreamer] Stopped. Total: ${this.messageCount} messages, ${this.errorCount} errors`);
    this.emit('health', { status: 'healthy', details: { polling: false, total_messages: this.messageCount } });
  }

  /**
   * Poll the HTTP endpoint
   * @private
   */
  async _poll() {
    if (!this.running) return;

    try {
      const data = await this._fetch();
      if (Array.isArray(data)) {
        // Array of transactions
        for (const item of data) {
          try {
            const tx = this._normalize(item);
            this.emit('data', tx);
            this.messageCount++;
          } catch (err) {
            console.error('[HttpStreamer] Normalization error:', err.message);
            this.emit('error', err);
            this.errorCount++;
          }
        }
      } else if (data && typeof data === 'object') {
        // Single transaction
        try {
          const tx = this._normalize(data);
          this.emit('data', tx);
          this.messageCount++;
        } catch (err) {
          console.error('[HttpStreamer] Normalization error:', err.message);
          this.emit('error', err);
          this.errorCount++;
        }
      }
      this.lastMessageTime = new Date();
    } catch (err) {
      console.error('[HttpStreamer] Poll error:', err.message);
      this.emit('error', err);
      this.errorCount++;
      this.emit('health', { status: 'degraded', details: { error: err.message, lastAttempt: new Date() } });
    }
  }

  /**
   * Fetch data from HTTP endpoint
   * @private
   */
  async _fetch() {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.config.url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const options = {
        method: this.config.method,
        timeout: this.config.timeoutMs,
        headers: {}
      };

      if (this.config.authToken) {
        options.headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }

      if (this.lastETag) {
        options.headers['If-None-Match'] = this.lastETag;
      }

      const req = client.request(urlObj, options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 304) {
            // Not Modified, use cached data
            resolve([]);
            return;
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }

          if (res.headers['etag']) {
            this.lastETag = res.headers['etag'];
          }

          try {
            const json = JSON.parse(body);
            // Extract transactions array if nested
            const transactions = json[this.config.bodyField] || json;
            resolve(transactions);
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.config.timeoutMs}ms`));
      });

      req.end();
    });
  }

  /**
   * Normalize transaction object
   * @private
   */
  _normalize(item) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid transaction object');
    }

    const amount = parseFloat(item.amount);
    if (isNaN(amount) || amount < 0) {
      throw new Error(`Invalid amount: ${item.amount}`);
    }

    const timestamp = item.transaction_timestamp || item.timestamp || item.created_at;
    if (!timestamp) {
      throw new Error('No timestamp found in transaction');
    }

    return {
      id: item.id || item.transaction_id || `http-${Date.now()}`,
      amount: amount,
      transaction_timestamp: new Date(timestamp).toISOString(),
      merchant_country: (item.merchant_country || item.country || 'US').toUpperCase().substring(0, 2),
      transaction_type: item.transaction_type || item.type || 'payment',
      // Preserve additional fields
      ...(item.merchant_id && { merchant_id: item.merchant_id }),
      ...(item.customer_id && { customer_id: item.customer_id }),
      ...(item.card_last_four && { card_last_four: item.card_last_four }),
      ...(typeof item.is_online === 'boolean' && { is_online: item.is_online })
    };
  }
}

module.exports = new HttpStreamer();

// Nicolas Larenas, nlarchive
