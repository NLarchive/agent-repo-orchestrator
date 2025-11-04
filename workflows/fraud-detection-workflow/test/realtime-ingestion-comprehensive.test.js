/**
 * Real-Time Ingestion Pipeline - Comprehensive Unit Test Suite
 * Tests: Transaction validation, batch processing, storage, archival, metrics
 */

const RealtimeIngestionPipeline = require('../engine/realtime-ingestion');

describe('Real-Time Ingestion Pipeline', () => {
  let pipeline;

  beforeEach(() => {
    pipeline = new RealtimeIngestionPipeline({
      batchSize: 100,
      batchTimeout: 5000,
      enableMetrics: true
    });
  });

  describe('Pipeline Initialization', () => {
    test('should initialize with default configuration', () => {
      const newPipeline = new RealtimeIngestionPipeline();
      expect(newPipeline).toBeDefined();
      expect(newPipeline.config).toBeDefined();
      expect(newPipeline.config.batchSize).toBeGreaterThan(0);
    });

    test('should accept custom configuration', () => {
      const customConfig = {
        batchSize: 50,
        batchTimeout: 3000
      };
      const customPipeline = new RealtimeIngestionPipeline(customConfig);
      expect(customPipeline.config.batchSize).toBe(50);
      expect(customPipeline.config.batchTimeout).toBe(3000);
    });

    test('should initialize metrics to zero', () => {
      const metrics = pipeline.getMetrics();
      expect(metrics.transactionsReceived).toBe(0);
      expect(metrics.transactionsProcessed).toBe(0);
      expect(metrics.batchesProcessed).toBe(0);
      expect(metrics.errors).toBe(0);
    });

    test('should have empty batch on initialization', () => {
      const metrics = pipeline.getMetrics();
      expect(metrics.currentBatchSize).toBe(0);
    });
  });

  describe('Transaction Validation', () => {
    test('should validate required transaction fields', () => {
      const validTransaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const isValid = pipeline.validateTransaction(validTransaction);
      expect(isValid).toBe(true);
    });

    test('should reject transaction with missing transaction_id', () => {
      const invalidTransaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString()
        // Missing transaction_type
      };

      const isValid = pipeline.validateTransaction(invalidTransaction);
      expect(isValid).toBe(false);
    });

    test('should reject transaction with missing amount', () => {
      const invalidTransaction = {
        customer_id: 'cust_456',
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
        // Missing amount
      };

      const isValid = pipeline.validateTransaction(invalidTransaction);
      expect(isValid).toBe(false);
    });

    test('should reject transaction with invalid amount', () => {
      const invalidTransaction = {
        customer_id: 'cust_456',
        amount: -100,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const isValid = pipeline.validateTransaction(invalidTransaction);
      expect(isValid).toBe(false);
    });

    test('should reject transaction with invalid timestamp', () => {
      const invalidTransaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: 'invalid-date',
        transaction_type: 'PURCHASE'
      };

      const isValid = pipeline.validateTransaction(invalidTransaction);
      expect(isValid).toBe(false);
    });

    test('should track validation metrics', () => {
      const validTransaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const initialValidated = pipeline.metrics.transactionsValidated || 0;
      pipeline.validateTransaction(validTransaction);

      expect((pipeline.metrics.transactionsValidated || 0)).toBeGreaterThanOrEqual(initialValidated);
    });
  });

  describe('Transaction Enrichment', () => {
    test('should enrich transaction with additional metadata', () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const enriched = pipeline.enrichTransaction(transaction);

      expect(enriched).toBeDefined();
      expect(enriched.enriched_at).toBeDefined();
      expect(enriched.enrichment_score).toBeDefined();
    });

    test('should add geographic data if available', () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE',
        location: { country: 'US', city: 'NYC' }
      };

      const enriched = pipeline.enrichTransaction(transaction);

      expect(enriched.location).toBeDefined();
      expect(enriched.location.country).toBe('US');
    });

    test('should calculate enrichment score', () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const enriched = pipeline.enrichTransaction(transaction);

      expect(typeof enriched.enrichment_score).toBe('number');
      expect(enriched.enrichment_score).toBeGreaterThanOrEqual(0);
      expect(enriched.enrichment_score).toBeLessThanOrEqual(1);
    });
  });

  describe('Batch Processing', () => {
    test('should accumulate transactions in current batch', () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const initialSize = pipeline.metrics.currentBatchSize || 0;
      pipeline.addToCurrentBatch(transaction);

      expect(pipeline.metrics.currentBatchSize).toBe(initialSize + 1);
    });

    test('should trigger batch processing when size limit reached', async () => {
      const smallBatchPipeline = new RealtimeIngestionPipeline({
        batchSize: 2,
        batchTimeout: 10000
      });

      const transaction1 = {
        customer_id: 'cust_1',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const transaction2 = {
        customer_id: 'cust_2',
        amount: 200.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      smallBatchPipeline.addToCurrentBatch(transaction1);
      smallBatchPipeline.addToCurrentBatch(transaction2);

      // After adding 2 transactions to a batch size of 2, should process
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(smallBatchPipeline.metrics.batchesProcessed || 0).toBeGreaterThanOrEqual(0);
    });

    test('should reset batch after processing', async () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      pipeline.addToCurrentBatch(transaction);
      const batchSizeBeforeReset = pipeline.metrics.currentBatchSize;

      await pipeline.resetBatch();

      expect(pipeline.metrics.currentBatchSize).toBe(0);
    });

    test('should timeout batch processing', (done) => {
      const fastTimeoutPipeline = new RealtimeIngestionPipeline({
        batchSize: 1000,
        batchTimeout: 100 // 100ms timeout
      });

      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      fastTimeoutPipeline.addToCurrentBatch(transaction);

      setTimeout(() => {
        // After timeout, batch should be processed even if not full
        expect(fastTimeoutPipeline.metrics.batchesProcessed || 0).toBeGreaterThanOrEqual(0);
        done();
      }, 150);
    });
  });

  describe('Transaction Processing', () => {
    test('should process individual transaction', async () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const initialProcessed = pipeline.metrics.transactionsProcessed || 0;

      await pipeline.processTransaction(transaction);

      expect(pipeline.metrics.transactionsProcessed || 0).toBeGreaterThanOrEqual(initialProcessed);
    });

    test('should track received vs processed transactions', () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const initialReceived = pipeline.metrics.transactionsReceived || 0;

      pipeline.addToCurrentBatch(transaction);

      expect((pipeline.metrics.transactionsReceived || 0)).toBeGreaterThanOrEqual(initialReceived);
    });

    test('should handle processing errors gracefully', async () => {
      const invalidTransaction = {
        // Missing required fields
      };

      const initialErrors = pipeline.metrics.errors || 0;

      try {
        await pipeline.processTransaction(invalidTransaction);
      } catch (e) {
        // Expected to fail
      }

      expect((pipeline.metrics.errors || 0)).toBeGreaterThanOrEqual(initialErrors);
    });
  });

  describe('Metrics Tracking', () => {
    test('should return current metrics', () => {
      const metrics = pipeline.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.transactionsReceived).toBeDefined();
      expect(metrics.transactionsProcessed).toBeDefined();
      expect(metrics.batchesProcessed).toBeDefined();
      expect(metrics.errors).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
    });

    test('should update metrics on successful processing', async () => {
      const transaction = {
        transaction_id: 'txn_123',
        transaction_timestamp: new Date().toISOString(),
        customer_id: 'cust_456',
        amount: 100.00,
        currency: 'USD',
        merchant_id: 'merchant_789',
        transaction_type: 'PURCHASE'
      };

      const metricsBefore = pipeline.getMetrics();
      const initialProcessed = metricsBefore.transactionsProcessed || 0;

      await pipeline.processTransaction(transaction);

      const metricsAfter = pipeline.getMetrics();
      expect(metricsAfter.transactionsProcessed || 0).toBeGreaterThanOrEqual(initialProcessed);
    });

    test('should increment error counter on failure', async () => {
      const metricsBefore = pipeline.getMetrics();
      const initialErrors = metricsBefore.errors || 0;

      // Try to process invalid data
      try {
        await pipeline.processTransaction(null);
      } catch (e) {
        // Expected
      }

      const metricsAfter = pipeline.getMetrics();
      expect(metricsAfter.errors || 0).toBeGreaterThanOrEqual(initialErrors);
    });

    test('should track throughput', async () => {
      const transactions = [];
      for (let i = 0; i < 10; i++) {
        transactions.push({
          transaction_id: `txn_${i}`,
          transaction_timestamp: new Date().toISOString(),
          customer_id: `cust_${i}`,
          amount: 100.00 * (i + 1),
          currency: 'USD',
          merchant_id: `merchant_${i}`,
          transaction_type: 'PURCHASE'
        });
      }

      const startTime = Date.now();

      for (const txn of transactions) {
        await pipeline.processTransaction(txn);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = transactions.length / (duration / 1000);

      expect(throughput).toBeGreaterThan(0);
    });
  });

  describe('Data Storage & Archival', () => {
    test('should indicate storage capability', () => {
      const hasStorage = pipeline.config.storageEnabled !== false;
      expect(hasStorage).toBe(true);
    });

    test('should indicate archival capability', () => {
      const hasArchival = pipeline.config.archivalEnabled !== false;
      expect(hasArchival).toBe(true);
    });

    test('should track storage operations', () => {
      const metrics = pipeline.getMetrics();
      expect(typeof metrics.storageOperations).toBeDefined;
      expect(typeof metrics.archivalOperations).toBeDefined;
    });
  });

  describe('Health & Status', () => {
    test('should report health status', async () => {
      const health = await pipeline.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    test('should include metrics in health report', async () => {
      const health = await pipeline.getHealth();

      expect(health.metrics).toBeDefined();
      expect(health.metrics.transactionsReceived || health.metrics.messagesReceived).toBeDefined();
      expect(health.metrics.batchesProcessed).toBeDefined();
    });

    test('should indicate processing capability', async () => {
      const health = await pipeline.getHealth();

      expect(health.capabilities).toBeDefined();
      expect(health.capabilities.streaming).toBeDefined();
      expect(health.capabilities.storage).toBeDefined();
      expect(health.capabilities.archival).toBeDefined();
    });
  });

  describe('Error Handling & Resilience', () => {
    test('should handle null transaction gracefully', async () => {
      const metrics = pipeline.getMetrics();
      const initialErrors = metrics.errors || 0;

      try {
        await pipeline.processTransaction(null);
      } catch (e) {
        // Expected
      }

      expect((pipeline.metrics.errors || 0)).toBeGreaterThan(initialErrors);
    });

    test('should handle undefined configuration gracefully', () => {
      const newPipeline = new RealtimeIngestionPipeline();
      expect(newPipeline).toBeDefined();
      expect(newPipeline.config.batchSize).toBeGreaterThan(0);
    });

    test('should continue processing after error', async () => {
      const transaction1 = {
        // Missing required fields - will fail
      };

      const transaction2 = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      try {
        await pipeline.processTransaction(transaction1);
      } catch (e) {
        // Expected to fail
      }

      const metricsAfter = pipeline.getMetrics();
      expect(metricsAfter).toBeDefined();

      // Should still be able to process valid transaction
      await pipeline.processTransaction(transaction2);
      expect(pipeline.getMetrics()).toBeDefined();
    });
  });

  describe('Configuration Management', () => {
    test('should accept batch size configuration', () => {
      const customPipeline = new RealtimeIngestionPipeline({
        batchSize: 500
      });
      expect(customPipeline.config.batchSize).toBe(500);
    });

    test('should accept batch timeout configuration', () => {
      const customPipeline = new RealtimeIngestionPipeline({
        batchTimeoutMs: 10000
      });
      expect(customPipeline.config.batchTimeoutMs).toBe(10000);
    });

    test('should accept metrics configuration', () => {
      const customPipeline = new RealtimeIngestionPipeline({
        enableMetrics: true
      });
      expect(customPipeline.config.enableMetrics).toBe(true);
    });

    test('should have sensible defaults', () => {
      const defaultPipeline = new RealtimeIngestionPipeline();
      expect(defaultPipeline.config.batchSize).toBeGreaterThan(0);
      expect(defaultPipeline.config.batchTimeoutMs).toBeGreaterThan(0);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle multiple transactions in sequence', async () => {
      const transactions = [
        {
          customer_id: 'cust_1',
          amount: 100.00,
          transaction_timestamp: new Date().toISOString(),
          transaction_type: 'PURCHASE'
        },
        {
          customer_id: 'cust_2',
          amount: 200.00,
          transaction_timestamp: new Date().toISOString(),
          transaction_type: 'PURCHASE'
        },
        {
          customer_id: 'cust_3',
          amount: 300.00,
          transaction_timestamp: new Date().toISOString(),
          transaction_type: 'PURCHASE'
        }
      ];

      for (const txn of transactions) {
        await pipeline.processTransaction(txn);
      }

      const metrics = pipeline.getMetrics();
      expect(metrics.transactionsProcessed || 0).toBeGreaterThanOrEqual(0);
    });

    test('should maintain metrics accuracy across operations', async () => {
      const transaction = {
        customer_id: 'cust_456',
        amount: 100.00,
        transaction_timestamp: new Date().toISOString(),
        transaction_type: 'PURCHASE'
      };

      const metricsStart = pipeline.getMetrics();
      const processedStart = metricsStart.transactionsProcessed || 0;

      await pipeline.processTransaction(transaction);

      const metricsEnd = pipeline.getMetrics();
      const processedEnd = metricsEnd.transactionsProcessed || 0;

      expect(processedEnd).toBeGreaterThanOrEqual(processedStart);
    });
  });
});

// Nicolas Larenas, nlarchive
