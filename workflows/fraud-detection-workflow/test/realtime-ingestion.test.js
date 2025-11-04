/**
 * Integration tests for Real-Time Data Ingestion Pipeline
 */

const RealtimeIngestionPipeline = require('../engine/realtime-ingestion');

describe('RealtimeIngestionPipeline', () => {
  let pipeline;

  beforeEach(() => {
    pipeline = new RealtimeIngestionPipeline({
      natsUrl: 'nats://localhost:4222',
      postgresUrl: 'postgres://postgres:password@localhost:5432/test_orchestrator',
      batchSize: 10,
      batchTimeoutMs: 1000
    });
  });

  afterEach(async () => {
    if (pipeline) {
      try {
        await pipeline.stop();
      } catch (error) {
        console.log('Error stopping pipeline:', error.message);
      }
    }
  });

  describe('Transaction Validation', () => {
    test('should accept valid transactions', () => {
      const transaction = {
        customer_id: '123',
        amount: 100,
        transaction_timestamp: new Date(),
        transaction_type: 'PURCHASE'
      };
      expect(pipeline.validateTransaction(transaction)).toBe(true);
    });

    test('should reject transactions missing required fields', () => {
      const transaction = {
        customer_id: '123',
        amount: 100
        // missing transaction_timestamp and transaction_type
      };
      expect(pipeline.validateTransaction(transaction)).toBe(false);
    });

    test('should reject transactions with null required fields', () => {
      const transaction = {
        customer_id: null,
        amount: 100,
        transaction_timestamp: new Date(),
        transaction_type: 'PURCHASE'
      };
      expect(pipeline.validateTransaction(transaction)).toBe(false);
    });
  });

  describe('Transaction Enrichment', () => {
    test('should enrich transaction with default values', () => {
      const transaction = {
        customer_id: '123',
        amount: 100,
        transaction_timestamp: new Date(),
        transaction_type: 'PURCHASE'
      };

      const enriched = pipeline.enrichTransaction(transaction);

      expect(enriched.id).toBeTruthy();
      expect(enriched.currency).toBe('USD');
      expect(enriched.status).toBe('PENDING');
      expect(enriched.enriched_at).toBeTruthy();
    });

    test('should preserve provided values', () => {
      const transaction = {
        customer_id: '123',
        amount: 100,
        transaction_timestamp: new Date(),
        transaction_type: 'PURCHASE',
        currency: 'EUR',
        status: 'COMPLETED'
      };

      const enriched = pipeline.enrichTransaction(transaction);

      expect(enriched.currency).toBe('EUR');
      expect(enriched.status).toBe('COMPLETED');
    });
  });

  describe('Metrics Tracking', () => {
    test('should initialize metrics correctly', () => {
      const metrics = pipeline.getMetrics();

      expect(metrics.messagesReceived).toBe(0);
      expect(metrics.messagesBatched).toBe(0);
      expect(metrics.messagesProcessed).toBe(0);
      expect(metrics.batchesProcessed).toBe(0);
      expect(metrics.errors).toBe(0);
    });

    test('should track received messages', async () => {
      const transaction = {
        customer_id: '123',
        amount: 100,
        transaction_timestamp: new Date(),
        transaction_type: 'PURCHASE'
      };

      await pipeline.processIncomingTransaction(transaction);

      const metrics = pipeline.getMetrics();
      expect(metrics.messagesReceived).toBe(1);
    });
  });

  describe('Batch Processing', () => {
    test('should accumulate transactions in batch', async () => {
      const transaction = {
        customer_id: '123',
        amount: 100,
        transaction_timestamp: new Date(),
        transaction_type: 'PURCHASE'
      };

      await pipeline.processIncomingTransaction(transaction);
      expect(pipeline.batch.length).toBe(1);

      await pipeline.processIncomingTransaction(transaction);
      expect(pipeline.batch.length).toBe(2);
    });

    test('should process batch when size is reached', async () => {
      jest.setTimeout(5000);

      pipeline.config.batchSize = 2;

      const transaction = {
        customer_id: '123',
        amount: 100,
        transaction_timestamp: new Date(),
        transaction_type: 'PURCHASE'
      };

      // Mock processBatch to avoid needing actual DB
      let batchProcessed = false;
      const originalProcessBatch = pipeline.processBatch.bind(pipeline);
      pipeline.processBatch = jest.fn(async function() {
        batchProcessed = true;
        this.batch = []; // Clear the batch like the real processBatch does
      }.bind(pipeline));

      await pipeline.processIncomingTransaction(transaction);
      expect(pipeline.batch.length).toBe(1);

      await pipeline.processIncomingTransaction(transaction);
      // Should trigger batch processing
      expect(batchProcessed).toBe(true);
      expect(pipeline.batch.length).toBe(0);

      pipeline.processBatch = originalProcessBatch;
    });
  });

  describe('Health Check', () => {
    test('should report health status', async () => {
      const health = await pipeline.getHealth();

      expect(health.status).toBeTruthy();
      expect(typeof health.nats).toBe('boolean');
      expect(typeof health.postgres).toBe('boolean');
      expect(health.metrics).toBeTruthy();
    });
  });
});

// Nicolas Larenas, nlarchive
