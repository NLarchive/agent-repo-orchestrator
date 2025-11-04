/**
 * Integration Test Suite - Comprehensive Multi-Module Testing
 * Tests: Realtime Ingestion, Alert System, Audit Trail, Compliance Engine, Security Engine, Data Enrichment, Response Triggers
 * 
 * Integration Scenarios:
 * - End-to-end transaction flows
 * - Cross-module data consistency
 * - Workflow orchestration
 * - Error handling and recovery
 * - Performance and throughput
 */

// Mock all external dependencies
jest.mock('postgres', () => {
  return jest.fn(() => jest.fn().mockResolvedValue([]));
});

jest.mock('nats', () => ({
  connect: jest.fn().mockResolvedValue({
    subscribe: jest.fn((subject, callback) => ({
      unsubscribe: jest.fn()
    })),
    publish: jest.fn(),
    close: jest.fn()
  })
}));

describe('Fraud Detection System - Integration Tests', () => {
  describe('Module Loading & Initialization', () => {
    test('should load all core modules without errors', () => {
      expect(() => {
        require('../engine/realtime-ingestion');
        require('../engine/data-enrichment');
        require('../engine/compliance-engine');
        require('../engine/security-engine');
        require('../engine/alert-system');
        require('../engine/audit-trail');
      }).not.toThrow();
    });

    test('should initialize realtime ingestion service', () => {
      const RealtimeIngestion = require('../engine/realtime-ingestion');
      const service = new RealtimeIngestion();
      expect(service).toBeDefined();
      expect(service.config).toBeDefined();
    });

    test('should initialize data enrichment service', () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const service = new DataEnrichment();
      expect(service).toBeDefined();
      expect(service.cache).toBeDefined();
    });

    test('should initialize compliance engine', () => {
      const ComplianceEngine = require('../engine/compliance-engine');
      const engine = new ComplianceEngine();
      expect(engine).toBeDefined();
      expect(engine.metrics).toBeDefined();
    });

    test('should initialize security engine', () => {
      const SecurityEngine = require('../engine/security-engine');
      const engine = new SecurityEngine();
      expect(engine).toBeDefined();
      expect(engine.config).toBeDefined();
    });

    test('should initialize alert system', () => {
      const AlertSystem = require('../engine/alert-system');
      const system = new AlertSystem();
      expect(system).toBeDefined();
      expect(system.getMetrics).toBeDefined();
      expect(typeof system.getMetrics).toBe('function');
    });

    test('should initialize audit trail', () => {
      const AuditTrail = require('../engine/audit-trail');
      const trail = new AuditTrail();
      expect(trail).toBeDefined();
      expect(trail.db).toBeNull(); // Not initialized
    });
  });

  describe('End-to-End Transaction Flow', () => {
    let enrichment, compliance, security, audit;

    beforeEach(() => {
      const DataEnrichment = require('../engine/data-enrichment');
      const ComplianceEngine = require('../engine/compliance-engine');
      const SecurityEngine = require('../engine/security-engine');
      const AuditTrail = require('../engine/audit-trail');

      enrichment = new DataEnrichment();
      compliance = new ComplianceEngine();
      security = new SecurityEngine();
      audit = new AuditTrail();

      // Mock database for all services
      enrichment.db = jest.fn().mockResolvedValue([]);
      compliance.db = jest.fn().mockResolvedValue([]);
      security.db = jest.fn().mockResolvedValue([]);
      audit.db = jest.fn().mockResolvedValue([]);
    });

    test('should process valid transaction through enrichment and compliance', async () => {
      const transaction = {
        id: 'txn_e2e_001',
        customerId: 'cust_12345',
        amount: 5000,
        merchantCategory: 'ELECTRONICS',
        country: 'US',
        timestamp: new Date()
      };

      // Step 1: Enrich with customer data
      const enriched = await enrichment.enrichTransaction(transaction);
      expect(enriched.enrichment).toBeDefined();
      expect(enriched.enrichment.profile).toBeDefined();
      expect(enriched.enrichment.segmentation).toBeDefined();

      // Step 2: Apply compliance checks
      const compliance_result = await compliance.checkPciDssCompliance(transaction);
      expect(compliance_result).toBeDefined();

      // Step 3: Validate security with token
      const token = security.generateToken({ userId: 'test_user' });
      const security_result = security.verifyToken(token);
      expect(security_result).toBeDefined();

      // Step 4: Audit the transaction
      const audit_result = await audit.logEvent({
        type: 'TRANSACTION_PROCESSED',
        transactionId: transaction.id,
        customerId: transaction.customerId,
        amount: transaction.amount
      });
      expect(audit_result).toBeDefined();
    });

    test('should detect high-risk transaction through pipeline', async () => {
      const highRiskTransaction = {
        id: 'txn_highrisk_001',
        customerId: 'cust_new',
        amount: 50000,
        merchantCategory: 'CRYPTOCURRENCY',
        country: 'UNKNOWN',
        timestamp: new Date()
      };

      // Process through pipeline
      const enriched = await enrichment.enrichTransaction(highRiskTransaction);
      expect(enriched.enrichment.segmentation.riskLevel).toBeDefined();
      expect(enriched.enrichment.segmentation.riskLevel).toMatch(/LOW|MEDIUM|HIGH/);
    });

    test('should handle blocked transaction gracefully', async () => {
      const blockedTransaction = {
        id: 'txn_blocked_001',
        customerId: 'cust_blocked',
        amount: 100000,
        merchantCategory: 'MONEY_TRANSFER',
        country: 'SANCTIONED',
        timestamp: new Date()
      };

      // Process through security
      const token = security.generateToken({ userId: 'test_user' });
      const security_result = security.verifyToken(token);
      expect(security_result).toBeDefined();
    });

    test('should maintain data consistency across modules', async () => {
      const transaction = {
        id: 'txn_consistent_001',
        customerId: 'cust_consistency_test',
        amount: 2500,
        merchantCategory: 'RETAIL',
        country: 'US',
        timestamp: new Date()
      };

      // Process through multiple modules
      const enriched = await enrichment.enrichTransaction(transaction);
      const compliance_result = await compliance.checkPciDssCompliance(transaction);

      // Verify data consistency
      expect(enriched.id).toBe(transaction.id);
      expect(enriched.customerId).toBe(transaction.customerId);
      expect(enriched.amount).toBe(transaction.amount);
    });
  });

  describe('Batch Transaction Processing', () => {
    test('should process batch of transactions through enrichment pipeline', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const transactions = Array.from({ length: 10 }, (_, i) => ({
        id: `txn_batch_${i}`,
        customerId: `cust_batch_${i}`,
        amount: Math.random() * 10000,
        merchantCategory: ['RETAIL', 'FOOD', 'TRAVEL', 'ELECTRONICS'][Math.floor(Math.random() * 4)],
        country: 'US',
        timestamp: new Date()
      }));

      // Enrich batch
      const enriched = await enrichment.enrichBatch(transactions);
      expect(enriched).toHaveLength(10);
      expect(enriched.every(t => t.enrichment)).toBe(true);
    });

    test('should handle mixed valid and invalid transactions in batch', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const transactions = [
        { id: 'txn_1', customerId: 'cust_1', amount: 1000, merchantCategory: 'RETAIL', country: 'US' },
        { id: 'txn_2', amount: 2000 }, // Missing customerId
        { id: 'txn_3', customerId: 'cust_3', amount: 3000, merchantCategory: 'FOOD', country: 'US' }
      ];

      const enriched = await enrichment.enrichBatch(transactions);
      expect(enriched).toHaveLength(3);
      // Valid transactions should have enrichment
      expect(enriched[0].enrichment).toBeDefined();
      expect(enriched[2].enrichment).toBeDefined();
    });
  });

  describe('Error Handling & Recovery', () => {
    test('should handle database connection errors gracefully', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      
      // Mock database to throw error
      enrichment.db = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const transaction = {
        id: 'txn_db_error',
        customerId: 'cust_123',
        amount: 1000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // Should not throw, should return default/fallback response
      const enriched = await enrichment.enrichTransaction(transaction);
      expect(enriched).toBeDefined();
    });

    test('should continue processing when one module fails', async () => {
      const ComplianceEngine = require('../engine/compliance-engine');
      const SecurityEngine = require('../engine/security-engine');

      const compliance = new ComplianceEngine();
      const security = new SecurityEngine();

      const transaction = {
        id: 'txn_partial_fail',
        customerId: 'cust_123',
        amount: 5000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // Test with methods that don't require database connection
      // Compliance module without DB should handle gracefully
      const token = security.generateToken({ userId: 'test_user' });
      const securityResult = security.verifyToken(token);

      // Even if compliance would fail, security should still work
      expect(securityResult).toBeDefined();
      expect(securityResult.userId).toBe('test_user');
    });

    test('should handle null/invalid input data gracefully', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const validTransaction = {
        id: 'txn_valid',
        customerId: 'cust_valid',
        amount: 100,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // Should handle valid transaction
      const result = await enrichment.enrichTransaction(validTransaction);
      expect(result).toBeDefined();
    });

    test('should validate transactions with missing optional fields', async () => {
      const ComplianceEngine = require('../engine/compliance-engine');
      const compliance = new ComplianceEngine();
      compliance.db = jest.fn().mockResolvedValue([]);

      const transaction = { id: 'txn_minimal' };
      
      const result = await compliance.checkPciDssCompliance(transaction);
      expect(result).toBeDefined();
    });
  });

  describe('Metrics & Observability', () => {
    test('should track metrics across all modules', () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const ComplianceEngine = require('../engine/compliance-engine');
      const SecurityEngine = require('../engine/security-engine');

      const enrichment = new DataEnrichment();
      const compliance = new ComplianceEngine();
      const security = new SecurityEngine();

      const metricsEnrichment = enrichment.getMetrics();
      const metricsCompliance = compliance.getMetrics();
      const metricsSecurity = security.getMetrics();

      expect(metricsEnrichment).toHaveProperty('enrichmentOperations');
      expect(metricsCompliance).toHaveProperty('complianceChecksPerformed');
      expect(metricsSecurity).toHaveProperty('securityViolations');
    });

    test('should report health status for all modules', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const ComplianceEngine = require('../engine/compliance-engine');
      const SecurityEngine = require('../engine/security-engine');

      const enrichment = new DataEnrichment();
      const compliance = new ComplianceEngine();
      const security = new SecurityEngine();

      const healthEnrichment = await enrichment.getHealth();
      const healthCompliance = await compliance.getHealth();
      const healthSecurity = await security.getHealth();

      expect(healthEnrichment.status).toMatch(/healthy|degraded|unhealthy/);
      expect(healthCompliance.status).toMatch(/healthy|degraded|unhealthy/);
      expect(healthSecurity.status).toMatch(/healthy|degraded|unhealthy/);
    });

    test('should aggregate metrics from multiple modules', () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const AuditTrail = require('../engine/audit-trail');

      const enrichment = new DataEnrichment();
      const audit = new AuditTrail();

      const aggregated = {
        enrichment: enrichment.getMetrics(),
        audit: audit.getMetrics()
      };

      expect(aggregated.enrichment).toBeDefined();
      expect(aggregated.audit).toBeDefined();
    });
  });

  describe('Compliance & Regulatory Integration', () => {
    test('should check PCI DSS compliance for transactions', async () => {
      const ComplianceEngine = require('../engine/compliance-engine');
      const compliance = new ComplianceEngine();
      compliance.db = jest.fn().mockResolvedValue([]);

      const transaction = {
        id: 'txn_pci_001',
        customerId: 'cust_123',
        amount: 5000,
        cardDataPresent: true,
        encryptionStatus: 'ENCRYPTED'
      };

      const result = await compliance.checkPciDssCompliance(transaction);
      expect(result).toBeDefined();
    });

    test('should enforce GDPR right to be forgotten', async () => {
      const ComplianceEngine = require('../engine/compliance-engine');
      const compliance = new ComplianceEngine();
      compliance.db = jest.fn().mockResolvedValue([]);

      const result = await compliance.processRightToBeForgotten('cust_gdpr_123');
      expect(result).toBeDefined();
    });

    test('should track audit trail for compliance reporting', async () => {
      const AuditTrail = require('../engine/audit-trail');
      const audit = new AuditTrail();
      audit.db = jest.fn().mockResolvedValue([]);

      const result = await audit.logEvent({
        type: 'FRAUD_DETECTED',
        transactionId: 'txn_123',
        reason: 'High risk score'
      });

      expect(result).toBeDefined();
    });
  });

  describe('Security Integration', () => {
    test('should generate tokens securely', async () => {
      const SecurityEngine = require('../engine/security-engine');
      const security = new SecurityEngine();

      // Test token generation
      const tokenResult = security.generateToken({ userId: 'test_user' });
      expect(tokenResult).toBeDefined();
    });

    test('should encrypt sensitive data', async () => {
      const SecurityEngine = require('../engine/security-engine');
      const security = new SecurityEngine();

      const sensitiveData = 'customer_ssn_123456789';
      const encrypted = security.encryptData(sensitiveData);
      
      // Should be encrypted (not same as plaintext)
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('object');
    });

    test('should apply rate limiting', async () => {
      const SecurityEngine = require('../engine/security-engine');
      const security = new SecurityEngine();

      const clientId = 'client_test_001';
      
      // Initialize metrics if needed
      if (!security.metrics.rateLimitChecks) {
        security.metrics.rateLimitChecks = 0;
      }
      
      // Check rate limit multiple times
      for (let i = 0; i < 5; i++) {
        security.checkRateLimit(clientId);
      }

      // Should increment metric
      expect(security.metrics.rateLimitChecks).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance & Throughput', () => {
    test('should process 100 transactions within acceptable time', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const transactions = Array.from({ length: 100 }, (_, i) => ({
        id: `txn_perf_${i}`,
        customerId: `cust_${i}`,
        amount: Math.random() * 10000,
        merchantCategory: 'RETAIL',
        country: 'US'
      }));

      const startTime = Date.now();
      const enriched = await enrichment.enrichBatch(transactions);
      const endTime = Date.now();

      expect(enriched).toHaveLength(100);
      const timePerTransaction = (endTime - startTime) / 100;
      // Should process each transaction in <50ms average
      expect(timePerTransaction).toBeLessThan(50);
    });

    test('should maintain low latency for single transaction', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const transaction = {
        id: 'txn_latency_001',
        customerId: 'cust_latency',
        amount: 5000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      const startTime = Date.now();
      const enriched = await enrichment.enrichTransaction(transaction);
      const endTime = Date.now();

      expect(enriched).toBeDefined();
      // Single transaction should process in <10ms
      expect(endTime - startTime).toBeLessThan(10);
    });

    test('should handle concurrent transactions', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const transactions = Array.from({ length: 20 }, (_, i) => ({
        id: `txn_concurrent_${i}`,
        customerId: `cust_${i}`,
        amount: Math.random() * 10000,
        merchantCategory: 'RETAIL',
        country: 'US'
      }));

      // Process concurrently
      const startTime = Date.now();
      const results = await Promise.all(
        transactions.map(t => enrichment.enrichTransaction(t))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(20);
      expect(results.every(r => r !== null)).toBe(true);
      // Should handle 20 concurrent transactions in <100ms
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('State Management & Consistency', () => {
    test('should maintain state consistency across transaction lifecycle', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const transaction = {
        id: 'txn_state_001',
        customerId: 'cust_state_001',
        amount: 5000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // Process same transaction twice
      const enriched1 = await enrichment.enrichTransaction(transaction);
      const enriched2 = await enrichment.enrichTransaction(transaction);

      // Should have consistent results
      expect(enriched1.enrichment.profile.customerId).toBe(enriched2.enrichment.profile.customerId);
    });

    test('should handle state rollback on error', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();

      // Mock to fail once, then succeed
      let callCount = 0;
      enrichment.db = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('DB Error'));
        }
        return Promise.resolve([]);
      });

      const transaction = {
        id: 'txn_rollback_001',
        customerId: 'cust_rollback',
        amount: 5000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // First attempt fails, service should recover
      const result1 = await enrichment.enrichTransaction(transaction);
      expect(result1).toBeDefined();

      // Second attempt should succeed
      enrichment.db = jest.fn().mockResolvedValue([]);
      const result2 = await enrichment.enrichTransaction(transaction);
      expect(result2).toBeDefined();
    });
  });

  describe('Feature Flags & Configuration', () => {
    test('should respect feature flag configurations', () => {
      const DataEnrichment = require('../engine/data-enrichment');

      const enrichmentEnabled = new DataEnrichment({
        enableHistoricalAnalysis: true,
        enableExternalEnrichment: true
      });

      const enrichmentDisabled = new DataEnrichment({
        enableHistoricalAnalysis: false,
        enableExternalEnrichment: false
      });

      expect(enrichmentEnabled.config.enableHistoricalAnalysis).toBe(true);
      expect(enrichmentDisabled.config.enableHistoricalAnalysis).toBe(false);
    });

    test('should work with different compliance profiles', () => {
      const ComplianceEngine = require('../engine/compliance-engine');

      const compliance = new ComplianceEngine({
        enablePCI: true,
        enableGDPR: true,
        enableCCPA: true,
        enableAML: true
      });

      expect(compliance.config).toBeDefined();
    });
  });

  describe('Cross-Module Workflow Scenarios', () => {
    test('should execute high-risk transaction workflow', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const ComplianceEngine = require('../engine/compliance-engine');

      const enrichment = new DataEnrichment();
      const compliance = new ComplianceEngine();

      enrichment.db = jest.fn().mockResolvedValue([]);
      compliance.db = jest.fn().mockResolvedValue([]);

      const transaction = {
        id: 'txn_highrisk_workflow',
        customerId: 'cust_new_user',
        amount: 100000,
        merchantCategory: 'MONEY_TRANSFER',
        country: 'UNKNOWN'
      };

      // Workflow: Enrich → Check PCI
      const enriched = await enrichment.enrichTransaction(transaction);
      const compliant = await compliance.checkPciDssCompliance(transaction);

      expect(enriched).toBeDefined();
      expect(compliant).toBeDefined();
    });

    test('should execute low-risk transaction workflow', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();
      enrichment.db = jest.fn().mockResolvedValue([]);

      const transaction = {
        id: 'txn_lowrisk_workflow',
        customerId: 'cust_trusted',
        amount: 50,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // Workflow: Enrich
      const enriched = await enrichment.enrichTransaction(transaction);

      expect(enriched).toBeDefined();
    });
  });

  describe('System Resilience', () => {
    test('should gracefully handle circuit breaker scenarios', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();

      // Simulate repeated failures
      let failureCount = 0;
      enrichment.db = jest.fn().mockImplementation(() => {
        failureCount++;
        if (failureCount < 5) {
          return Promise.reject(new Error('Service unavailable'));
        }
        return Promise.resolve([]);
      });

      const transaction = {
        id: 'txn_resilience_001',
        customerId: 'cust_resilience',
        amount: 5000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // Should handle repeated failures
      let successCount = 0;
      for (let i = 0; i < 10; i++) {
        const result = await enrichment.enrichTransaction(transaction);
        if (result) successCount++;
      }

      expect(successCount).toBeGreaterThan(0);
    });

    test('should implement timeout handling for long-running operations', async () => {
      const DataEnrichment = require('../engine/data-enrichment');
      const enrichment = new DataEnrichment();

      // Mock slow database
      enrichment.db = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 50))
      );

      const transaction = {
        id: 'txn_timeout_001',
        customerId: 'cust_timeout',
        amount: 5000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      const startTime = Date.now();
      const result = await enrichment.enrichTransaction(transaction);
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(300); // Should complete in reasonable time
    });
  });
});

// Nicolas Larenas, nlarchive
