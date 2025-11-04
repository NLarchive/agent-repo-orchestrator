# Streamer Plugin System

The streamer system provides a pluggable architecture for ingesting transaction data from multiple sources. A **streamer** is responsible for fetching or subscribing to transaction data, normalizing it, and emitting events that the fraud detection pipeline processes.

## Architecture

### Streamer Manager (`manager.js`)
- Loads and manages streamer plugins by name.
- Forwards streamer events (data, error, health) to registered listeners.
- Provides a unified interface for starting, stopping, and configuring streamers.

### Streamer Interface
Each streamer module must implement:

```javascript
{
  name: 'streamer-name',
  init: async (config) => { /* initialize */ },
  start: async () => { /* begin data emission */ },
  stop: async () => { /* stop gracefully */ },
  on: (event, callback) => { /* register listeners */ }
}
```

**Events emitted:**
- `data` — normalized transaction object: `{ id, amount, transaction_timestamp, merchant_country, transaction_type, ... }`
- `error` — error instance (if needed, streamer can swallow errors)
- `health` — { status: 'healthy' | 'degraded' | 'unhealthy', details: {...} }

### Transaction Normalization
All streamers normalize data to this schema:

```javascript
{
  id: string,                    // unique tx id
  amount: number,                // transaction amount
  transaction_timestamp: string, // ISO 8601 timestamp
  merchant_country: string,      // 2-letter country code (default: 'US')
  transaction_type: string,      // 'payment', 'withdrawal', etc. (default: 'payment')
  // ... other optional fields
}
```

## Available Streamers

### 1. mock-streamer
Generates synthetic transactions at a configurable rate for testing and demos.

**Environment variables:**
- `MOCK_INTERVAL_MS` — interval between batches (default: 1000)
- `MOCK_BATCH_SIZE` — transactions per batch (default: 50)
- `MOCK_ENABLED` — set to 'true' to use mock streamer

**Usage:**
```javascript
const manager = require('./manager');
await manager.load('mock', { intervalMs: 1000, batchSize: 50 });
manager.on('data', (tx) => pipeline.process(tx));
await manager.start();
```

### 2. nats-streamer
Subscribes to a NATS subject for real-time transaction streams.

**Environment variables:**
- `NATS_URL` — NATS server URL (default: 'nats://nats:4222')
- `NATS_SUBJECT` — subject to subscribe (default: 'transactions')
- `NATS_QUEUE` — optional queue group for load balancing

**Usage:**
```javascript
const manager = require('./manager');
await manager.load('nats', { 
  servers: 'nats://nats:4222', 
  subject: 'transactions',
  queueGroup: 'fraud-detector' 
});
manager.on('data', (tx) => pipeline.process(tx));
await manager.start();
```

### 3. http-streamer
Polls an HTTP endpoint for transaction data periodically.

**Environment variables:**
- `HTTP_URL` — endpoint URL (default: 'http://localhost:8080/transactions')
- `HTTP_INTERVAL_MS` — poll interval (default: 5000)
- `HTTP_TIMEOUT_MS` — request timeout (default: 10000)
- `HTTP_AUTH_TOKEN` — optional bearer token

**Usage:**
```javascript
const manager = require('./manager');
await manager.load('http', { 
  url: 'http://api.example.com/transactions',
  intervalMs: 5000,
  timeoutMs: 10000,
  authToken: process.env.API_TOKEN 
});
manager.on('data', (tx) => pipeline.process(tx));
await manager.start();
```

## Integration Example

In `orchestrator/index.js`:

```javascript
const streamerManager = require('./streamers/manager');
const pipeline = require('./engine/realtime-ingestion'); // or your pipeline

const streamerName = process.env.STREAMER || 'mock';
const streamerConfig = {
  // Load config from env or defaults
};

(async () => {
  try {
    await streamerManager.load(streamerName, streamerConfig);
    
    streamerManager.on('data', (tx) => {
      // Process normalized transaction
      pipeline.processTransaction(tx).catch(err => logger.error('pipeline error', err));
    });
    
    streamerManager.on('error', (err) => {
      logger.error('streamer error', err);
      // Optionally emit metrics for error tracking
    });
    
    streamerManager.on('health', (status) => {
      logger.info('streamer health:', status);
    });
    
    await streamerManager.start();
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Shutting down streamer...');
      await streamerManager.stop();
      process.exit(0);
    });
  } catch (err) {
    logger.fatal('Failed to start streamer', err);
    process.exit(1);
  }
})();
```

## Adding a New Streamer

1. Create `orchestrator/streamers/my-streamer.js`
2. Implement the streamer interface (init, start, stop, on)
3. Normalize incoming data to the transaction schema
4. Emit 'data' events for valid transactions
5. Update `manager.js` to recognize your streamer name
6. Test with a small integration script

Example template:

```javascript
const EventEmitter = require('events');

class MyStreamer extends EventEmitter {
  async init(config = {}) {
    this.config = config;
    this.running = false;
  }

  async start() {
    this.running = true;
    // Begin ingestion
    this._poll();
  }

  async stop() {
    this.running = false;
    // Cleanup resources
  }

  async _poll() {
    while (this.running) {
      try {
        const data = await this._fetch();
        const normalized = this._normalize(data);
        this.emit('data', normalized);
      } catch (err) {
        this.emit('error', err);
      }
      // Sleep or await next event
    }
  }

  _normalize(item) {
    return {
      id: item.id || `tx-${Date.now()}`,
      amount: parseFloat(item.amount) || 0,
      transaction_timestamp: new Date(item.timestamp || Date.now()).toISOString(),
      merchant_country: item.country || 'US',
      transaction_type: item.type || 'payment'
    };
  }
}

module.exports = new MyStreamer();
```

## Metrics & Observability

Each streamer should register Prometheus metrics to track:
- Messages ingested
- Errors encountered
- Normalization failures
- Last message timestamp

Example instrumentation in streamer:

```javascript
const prom = require('prom-client');

const streamerMessagesTotal = new prom.Counter({
  name: 'streamer_messages_total',
  help: 'Total messages ingested by streamer',
  labelNames: ['streamer_name', 'status']
});

this.emit('data', tx);
streamerMessagesTotal.inc({ streamer_name: 'mock', status: 'success' });
```

## Troubleshooting

- **No data flowing**: Check that the correct streamer is loaded via `STREAMER` env var.
- **Normalization errors**: Verify incoming data schema matches expected format; add logging in `_normalize()`.
- **Connection issues**: For NATS/HTTP streamers, verify network connectivity and credentials.
- **Memory growth**: Monitor for message buffering; add backpressure handling if batch sizes grow.

---

For more details, see individual streamer files and integration examples.

<!-- Nicolas Larenas, nlarchive -->
