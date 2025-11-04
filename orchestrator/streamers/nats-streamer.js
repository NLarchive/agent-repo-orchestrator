/**
 * NATS Streamer - Subscribes to NATS subject for real-time transactions
 * 
 * Configuration:
 *   - servers: NATS server URL or array of URLs (default: 'nats://nats:4222')
 *   - subject: NATS subject to subscribe to (default: 'transactions')
 *   - queueGroup: optional queue group for load balancing
 *   - retryIntervalMs: retry interval on connection loss (default: 5000)
 * 
 * Environment variables:
 *   - NATS_URL: override servers
 *   - NATS_SUBJECT: override subject
 *   - NATS_QUEUE_GROUP: override queueGroup
 */

const EventEmitter = require('events');

class NatsStreamer extends EventEmitter {
  async init(config = {}) {
    this.config = Object.assign({
      servers: process.env.NATS_URL || 'nats://nats:4222',
      subject: process.env.NATS_SUBJECT || 'transactions',
      queueGroup: process.env.NATS_QUEUE_GROUP || undefined,
      retryIntervalMs: 5000
    }, config);

    this.running = false;
    this.nc = null;
    this.sub = null;
    this.messageCount = 0;
    this.errorCount = 0;
    this.lastMessageTime = null;

    // Lazy load nats client to avoid hard dependency
    try {
      this.nats = require('nats');
    } catch (err) {
      console.warn('[NatsStreamer] Warning: nats module not installed. Install with: npm install nats');
      this.natsAvailable = false;
      return;
    }

    this.natsAvailable = true;
    console.log(`[NatsStreamer] Initialized with config:`, {
      servers: this.config.servers,
      subject: this.config.subject,
      queueGroup: this.config.queueGroup
    });
  }

  async start() {
    if (!this.natsAvailable) {
      throw new Error('NATS module not available. Install with: npm install nats');
    }

    if (this.running) {
      console.warn('[NatsStreamer] Already running');
      return;
    }

    this.running = true;

    try {
      // Connect to NATS
      this.nc = await this.nats.connect({
        servers: this.config.servers,
        reconnect: true,
        maxReconnectAttempts: -1,
        reconnectDelayMs: this.config.retryIntervalMs
      });

      console.log(`[NatsStreamer] Connected to NATS at ${this.config.servers}`);
      this.emit('health', { status: 'healthy', details: { connected: true, subject: this.config.subject } });

      // Subscribe to subject
      const subscribeOptions = {};
      if (this.config.queueGroup) {
        subscribeOptions.queue = this.config.queueGroup;
      }

      this.sub = await this.nc.subscribe(this.config.subject, subscribeOptions);

      console.log(`[NatsStreamer] Subscribed to subject: ${this.config.subject}`);

      // Start listening for messages
      this._listen();
    } catch (err) {
      this.running = false;
      console.error('[NatsStreamer] Failed to start:', err.message);
      this.emit('error', err);
      this.emit('health', { status: 'unhealthy', details: { error: err.message } });
      throw err;
    }
  }

  async stop() {
    if (!this.running) {
      console.warn('[NatsStreamer] Not running');
      return;
    }

    this.running = false;

    try {
      if (this.sub) {
        this.sub.unsubscribe();
        this.sub = null;
      }
      if (this.nc) {
        await this.nc.close();
        this.nc = null;
      }
      console.log(`[NatsStreamer] Stopped. Total: ${this.messageCount} messages, ${this.errorCount} errors`);
      this.emit('health', { status: 'healthy', details: { running: false, total_messages: this.messageCount } });
    } catch (err) {
      console.error('[NatsStreamer] Error during stop:', err.message);
      this.emit('error', err);
    }
  }

  /**
   * Listen for incoming NATS messages
   * @private
   */
  async _listen() {
    try {
      for await (const msg of this.sub) {
        if (!this.running) break;

        try {
          const data = JSON.parse(msg.data.toString());
          const tx = this._normalize(data);
          this.emit('data', tx);
          this.messageCount++;
          this.lastMessageTime = new Date();
        } catch (err) {
          console.error('[NatsStreamer] Error processing message:', err.message);
          this.emit('error', err);
          this.errorCount++;
        }
      }
    } catch (err) {
      if (this.running) {
        console.error('[NatsStreamer] Subscription ended unexpectedly:', err.message);
        this.emit('error', err);
        this.emit('health', { status: 'degraded', details: { error: err.message } });
      }
    }
  }

  /**
   * Normalize incoming NATS message to transaction schema
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
      id: item.id || item.transaction_id || `nats-${Date.now()}`,
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

module.exports = new NatsStreamer();

// Nicolas Larenas, nlarchive
