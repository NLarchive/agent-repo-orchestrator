/**
 * Mock Streamer - Generates synthetic transaction data for testing
 * 
 * Configuration:
 *   - intervalMs: interval in milliseconds between batches (default: 1000)
 *   - batchSize: number of transactions per batch (default: 50)
 * 
 * Environment variables:
 *   - MOCK_INTERVAL_MS: override intervalMs
 *   - MOCK_BATCH_SIZE: override batchSize
 */

const EventEmitter = require('events');

class MockStreamer extends EventEmitter {
  async init(config = {}) {
    this.config = Object.assign({
      intervalMs: parseInt(process.env.MOCK_INTERVAL_MS) || 1000,
      batchSize: parseInt(process.env.MOCK_BATCH_SIZE) || 50
    }, config);

    this.running = false;
    this.timer = null;
    this.transactionCount = 0;
    this.errorCount = 0;
    
    console.log(`[MockStreamer] Initialized with config:`, this.config);
  }

  async start() {
    if (this.running) {
      console.warn('[MockStreamer] Already running');
      return;
    }

    this.running = true;
    console.log(`[MockStreamer] Started`);
    this.emit('health', { status: 'healthy', details: { running: true } });

    this.timer = setInterval(() => {
      this._generateBatch();
    }, this.config.intervalMs);

    // Generate initial batch immediately
    this._generateBatch();
  }

  async stop() {
    if (!this.running) {
      console.warn('[MockStreamer] Not running');
      return;
    }

    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log(`[MockStreamer] Stopped. Total: ${this.transactionCount} tx, ${this.errorCount} errors`);
    this.emit('health', { status: 'healthy', details: { running: false, total_emitted: this.transactionCount } });
  }

  /**
   * Generate a batch of synthetic transactions
   * @private
   */
  _generateBatch() {
    if (!this.running) return;

    const batchSize = Math.max(1, Math.round(this.config.batchSize * (0.6 + Math.random() * 0.8)));
    
    for (let i = 0; i < batchSize; i++) {
      try {
        const tx = this._generateTransaction();
        this.emit('data', tx);
        this.transactionCount++;
      } catch (err) {
        console.error('[MockStreamer] Error generating transaction:', err.message);
        this.emit('error', err);
        this.errorCount++;
      }
    }
  }

  /**
   * Generate a single synthetic transaction
   * @private
   * @returns {object} normalized transaction
   */
  _generateTransaction() {
    const amount = Math.round(Math.random() * 100000) / 100; // 0.00 - 1000.00
    const countries = ['US', 'CA', 'GB', 'DE', 'FR', 'JP', 'CN', 'BR', 'IN', 'MX'];
    const types = ['payment', 'withdrawal', 'deposit', 'transfer'];
    
    return {
      id: `mock-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      amount: amount,
      transaction_timestamp: new Date().toISOString(),
      merchant_country: countries[Math.floor(Math.random() * countries.length)],
      transaction_type: types[Math.floor(Math.random() * types.length)],
      // Optional enrichment fields
      merchant_id: `merchant-${Math.floor(Math.random() * 10000)}`,
      customer_id: `cust-${Math.floor(Math.random() * 100000)}`,
      card_last_four: Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
      is_online: Math.random() > 0.3 // 70% online, 30% in-store
    };
  }
}

module.exports = new MockStreamer();

// Nicolas Larenas, nlarchive
