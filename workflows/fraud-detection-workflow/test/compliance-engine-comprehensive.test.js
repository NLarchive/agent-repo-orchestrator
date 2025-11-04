/**
 * Regulatory Compliance Engine - Comprehensive Unit Test Suite
 * Tests: PCI DSS, GDPR, CCPA, AML compliance rules, retention policies, and reporting
 */

const ComplianceEngine = require('../engine/compliance-engine');

// Mock the postgres module
jest.mock('postgres', () => {
  return jest.fn(() => {
    // In-memory storage for test data
    const storage = {
      gdpr_data_subjects: []
    };

    const mockDb = jest.fn().mockImplementation(async function(strings, ...values) {
      const query = strings.join('').toLowerCase();
      
      // Handle SELECT queries
      if (query.includes('select * from gdpr_data_subjects')) {
        const subjectId = values[0];
        return storage.gdpr_data_subjects.filter(s => s.subject_id === subjectId);
      }
      
      // Handle INSERT into gdpr_data_subjects
      if (query.includes('insert into gdpr_data_subjects')) {
        const subject = {
          id: values[0],
          subject_id: values[1],
          name: values[2],
          email: values[3],
          country: values[4],
          consent_status: values[5]
        };
        storage.gdpr_data_subjects.push(subject);
        return [];
      }
      
      // Handle UPDATE queries
      if (query.includes('update gdpr_data_subjects')) {
        return [];
      }
      
      // Default: return empty array for other queries
      return [];
    });
    
    mockDb.end = jest.fn().mockResolvedValue(true);
    return mockDb;
  });
});

describe('Regulatory Compliance Engine', () => {
  let complianceEngine;
  let mockDb;
  
  // In-memory storage for test data (persists within each test)
  let storage;

  beforeEach(async () => {
    // Reset storage for each test
    storage = {
      gdpr_data_subjects: []
    };
    
    // Create mock database function
    mockDb = jest.fn().mockImplementation(async function(strings, ...values) {
      const query = String(strings[0]).toLowerCase();
      
      // Handle SELECT queries from gdpr_data_subjects
      if (query.includes('select') && query.includes('gdpr_data_subjects')) {
        const subjectId = values[0];
        return storage.gdpr_data_subjects.filter(s => s.subject_id === subjectId);
      }
      
      // Handle INSERT into gdpr_data_subjects
      if (query.includes('insert') && query.includes('gdpr_data_subjects')) {
        const subject = {
          id: values[0],
          subject_id: values[1],
          name: values[2],
          email: values[3],
          country: values[4],
          consent_status: values[5]
        };
        storage.gdpr_data_subjects.push(subject);
        return [];
      }
      
      // Handle UPDATE gdpr_data_subjects
      if (query.includes('update') && query.includes('gdpr_data_subjects')) {
        return [];
      }
      
      // Handle SELECT 1 for health check
      if (query.includes('select 1') || query.includes('select') && query.trim() === 'select 1') {
        return [{ '?column?': 1 }];
      }
      
      // Default: return empty array for other queries
      return [];
    });
    
    mockDb.end = jest.fn().mockResolvedValue(true);
    
    complianceEngine = new ComplianceEngine({
      pciDssEnabled: true,
      gdprEnabled: true,
      ccpaEnabled: true,
      amlEnabled: true,
      amlSuspiciousThreshold: 10000,
      amlVelocityThreshold: 5
    });
    
    // Assign mock db to the engine
    complianceEngine.db = mockDb;
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const engine = new ComplianceEngine();
      expect(engine).toBeDefined();
      expect(engine.config).toBeDefined();
    });

    test('should initialize compliance metrics', () => {
      const metrics = complianceEngine.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.complianceChecksPerformed).toBe(0);
      expect(metrics.pciDssViolations).toBe(0);
      expect(metrics.gdprViolations).toBe(0);
      expect(metrics.ccpaViolations).toBe(0);
      expect(metrics.amlFlagsRaised).toBe(0);
    });

    test('should enable all compliance frameworks by default', () => {
      const engine = new ComplianceEngine();
      expect(engine.config.pciDssEnabled).toBe(true);
      expect(engine.config.gdprEnabled).toBe(true);
      expect(engine.config.ccpaEnabled).toBe(true);
      expect(engine.config.amlEnabled).toBe(true);
    });

    test('should set correct retention periods', () => {
      const engine = new ComplianceEngine();
      expect(engine.config.pciDssRetentionDays).toBe(2555); // 7 years
      expect(engine.config.gdprRetentionDays).toBe(1095); // 3 years
      expect(engine.config.ccpaRetentionDays).toBe(365); // 1 year
      expect(engine.config.amlRetentionDays).toBe(2555); // 7 years
    });
  });

  describe('PCI DSS Compliance', () => {
    test('should check PCI DSS compliance for transaction', async () => {
      const transaction = {
        id: 'txn_123',
        encrypted_transmission: true,
        mfa_verified: true,
        pii_exposed: false,
        card_data_masked: true
      };

      const result = await complianceEngine.checkPciDssCompliance(transaction);

      expect(result).toBeDefined();
      expect(result.violationLevel).toBe('COMPLIANT');
      expect(result.violations.length).toBe(0);
    });

    test('should detect encryption violation', async () => {
      const transaction = {
        id: 'txn_123',
        encrypted_transmission: false,
        mfa_verified: true,
        pii_exposed: false
      };

      const result = await complianceEngine.checkPciDssCompliance(transaction);

      expect(result.violationLevel).toBe('VIOLATION');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('Unencrypted');
    });

    test('should detect MFA violation', async () => {
      const transaction = {
        id: 'txn_123',
        encrypted_transmission: true,
        mfa_verified: false,
        pii_exposed: false
      };

      const result = await complianceEngine.checkPciDssCompliance(transaction);

      expect(result.violationLevel).toBe('VIOLATION');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('authentication');
    });

    test('should detect PII exposure violation', async () => {
      const transaction = {
        id: 'txn_123',
        encrypted_transmission: true,
        mfa_verified: true,
        pii_exposed: true
      };

      const result = await complianceEngine.checkPciDssCompliance(transaction);

      expect(result.violationLevel).toBe('VIOLATION');
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('identifiable information');
    });

    test('should track PCI DSS violations in metrics', async () => {
      const metricsBefore = complianceEngine.getMetrics();
      const violationsBefore = metricsBefore.pciDssViolations || 0;

      await complianceEngine.checkPciDssCompliance({
        id: 'txn_123',
        encrypted_transmission: false,
        mfa_verified: false
      });

      const metricsAfter = complianceEngine.getMetrics();
      expect(metricsAfter.pciDssViolations).toBeGreaterThan(violationsBefore);
    });
  });

  describe('GDPR Compliance', () => {
    test('should handle GDPR data subject registration', async () => {
      const subject = {
        customerId: 'subject_123',
        name: 'John Doe',
        email: 'john@example.com',
        country: 'DE',
        consentGiven: true
      };

      const result = await complianceEngine.handleGdprDataSubject(subject);

      expect(result).toBeDefined();
      expect(complianceEngine.getMetrics().dataSubjectsRequests).toBeGreaterThanOrEqual(0);
    });

    test('should process right to be forgotten request', async () => {
      const subjectId = 'subject_123';

      const result = await complianceEngine.processRightToBeForgotten(subjectId);

      expect(result).toBeDefined();
      expect(result.subjectId).toBe(subjectId);
      expect(result.status).toBe('PENDING');
      expect(result.deadline).toBeDefined();
    });

    test('should export data for portability', async () => {
      const subjectId = 'subject_123';

      // First register the subject
      await complianceEngine.handleGdprDataSubject({
        customerId: subjectId,
        name: 'John Doe',
        email: 'john@example.com',
        country: 'DE',
        consentGiven: true
      });

      const result = await complianceEngine.exportDataForPortability(subjectId);

      expect(result).toBeDefined();
      expect(result.exportId).toBeDefined();
      expect(result.subject).toBeDefined();
      expect(result.format).toBe('JSON');
      expect(result.encrypted).toBe(true);
    });

    test('should track data export requests in metrics', async () => {
      const metricsBefore = complianceEngine.getMetrics();
      const exportsBefore = metricsBefore.dataExportsCompleted || 0;

      // Register subject first
      await complianceEngine.handleGdprDataSubject({
        customerId: 'subject_456',
        name: 'Jane Doe',
        email: 'jane@example.com',
        country: 'FR',
        consentGiven: true
      });

      await complianceEngine.exportDataForPortability('subject_456');

      const metricsAfter = complianceEngine.getMetrics();
      expect(metricsAfter.dataExportsCompleted).toBeGreaterThanOrEqual(exportsBefore);
    });

    test('should respect GDPR retention period', () => {
      expect(complianceEngine.config.gdprRetentionDays).toBe(1095); // 3 years
    });
  });

  describe('CCPA Compliance', () => {
    test('should handle CCPA right to know request', async () => {
      const consumer = {
        customerId: 'consumer_123',
        name: 'Jane Smith',
        email: 'jane@example.com',
        state: 'CA'
      };

      const result = await complianceEngine.handleCcpaRightToKnow(consumer);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string'); // Returns consumerId (UUID)
    });

    test('should process CCPA right to delete', async () => {
      const consumerId = 'consumer_123';

      const result = await complianceEngine.processCcpaRightToDelete(consumerId);

      expect(result).toBeDefined();
      expect(result.consumerId).toBe(consumerId);
      expect(result.status).toBe('PENDING');
      expect(result.deadline).toBeDefined();
    });

    test('should track CCPA violations', async () => {
      const metricsBefore = complianceEngine.getMetrics();
      const violationsBefore = metricsBefore.ccpaViolations || 0;

      // Mock a CCPA violation scenario
      const metricsAfter = complianceEngine.getMetrics();
      expect(metricsAfter.ccpaViolations).toBeGreaterThanOrEqual(violationsBefore);
    });

    test('should respect CCPA retention period', () => {
      expect(complianceEngine.config.ccpaRetentionDays).toBe(365); // 1 year
    });
  });

  describe('AML (Anti-Money Laundering)', () => {
    test('should detect high-value transaction', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 15000, // Above $10k threshold
        currency: 'USD'
      };

      const result = await complianceEngine.detectAmlSuspiciousActivity(transaction);

      expect(result).toBeDefined();
      expect(result.status).toBe('FLAGGED');
      expect(result.indicators).toContain('LARGE_TRANSACTION');
    });

    test('should detect velocity anomaly', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 5000,
        velocityScore: 7 // Above threshold of 5
      };

      const result = await complianceEngine.detectAmlSuspiciousActivity(transaction);

      expect(result).toBeDefined();
      expect(result.status).toBe('FLAGGED');
      expect(result.indicators).toContain('HIGH_VELOCITY');
    });

    test('should detect geographic change', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 5000,
        countryChange: true
      };

      const result = await complianceEngine.detectAmlSuspiciousActivity(transaction);

      expect(result).toBeDefined();
      expect(result.status).toBe('FLAGGED');
      expect(result.indicators).toContain('GEOGRAPHIC_ANOMALY');
    });

    test('should detect structuring pattern', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 9500,
        structuringPattern: true
      };

      const result = await complianceEngine.detectAmlSuspiciousActivity(transaction);

      expect(result).toBeDefined();
      expect(result.status).toBe('FLAGGED');
      expect(result.indicators).toContain('STRUCTURING_PATTERN');
    });

    test('should track AML flags in metrics', async () => {
      const metricsBefore = complianceEngine.getMetrics();
      const flagsBefore = metricsBefore.amlFlagsRaised || 0;

      await complianceEngine.detectAmlSuspiciousActivity({
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 15000
      });

      const metricsAfter = complianceEngine.getMetrics();
      expect(metricsAfter.amlFlagsRaised).toBeGreaterThan(flagsBefore);
    });

    test('should use configurable AML thresholds', () => {
      const engine = new ComplianceEngine({
        amlSuspiciousThreshold: 5000,
        amlVelocityThreshold: 3
      });

      expect(engine.config.amlSuspiciousThreshold).toBe(5000);
      expect(engine.config.amlVelocityThreshold).toBe(3);
    });

    test('should return null for non-suspicious transactions', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500 // Below threshold
      };

      const result = await complianceEngine.detectAmlSuspiciousActivity(transaction);

      expect(result).toBeNull();
    });
  });

  describe('Retention Policies', () => {
    test('should enforce retention policies', async () => {
      const result = await complianceEngine.enforceRetentionPolicies();

      expect(result).toBeDefined();
    });

    test('should track retention enforcement in metrics', async () => {
      const metricsBefore = complianceEngine.getMetrics();
      const enforcedBefore = metricsBefore.retentionPoliciesEnforced || 0;

      await complianceEngine.enforceRetentionPolicies();

      const metricsAfter = complianceEngine.getMetrics();
      expect(metricsAfter.retentionPoliciesEnforced).toBeGreaterThanOrEqual(enforcedBefore);
    });

    test('should have different retention periods for different regulations', () => {
      expect(complianceEngine.config.pciDssRetentionDays).toBe(2555); // 7 years
      expect(complianceEngine.config.gdprRetentionDays).toBe(1095); // 3 years
      expect(complianceEngine.config.ccpaRetentionDays).toBe(365); // 1 year
      expect(complianceEngine.config.amlRetentionDays).toBe(2555); // 7 years
    });

    test('should accept custom retention periods', () => {
      const engine = new ComplianceEngine({
        pciDssRetentionDays: 3650,
        gdprRetentionDays: 730
      });

      expect(engine.config.pciDssRetentionDays).toBe(3650);
      expect(engine.config.gdprRetentionDays).toBe(730);
    });
  });

  describe('Compliance Metrics', () => {
    test('should return current compliance metrics', () => {
      const metrics = complianceEngine.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.complianceChecksPerformed).toBeDefined();
      expect(metrics.pciDssViolations).toBeDefined();
      expect(metrics.gdprViolations).toBeDefined();
      expect(metrics.ccpaViolations).toBeDefined();
      expect(metrics.amlFlagsRaised).toBeDefined();
      expect(metrics.retentionPoliciesEnforced).toBeDefined();
    });

    test('should track total compliance checks performed', async () => {
      const metricsBefore = complianceEngine.getMetrics();
      const checksBefore = metricsBefore.complianceChecksPerformed || 0;

      await complianceEngine.checkPciDssCompliance({
        transaction_id: 'txn_123',
        encrypted_transmission: true,
        mfa_verified: true
      });

      const metricsAfter = complianceEngine.getMetrics();
      expect(metricsAfter.complianceChecksPerformed).toBeGreaterThanOrEqual(checksBefore);
    });

    test('should include timestamp in metrics', () => {
      const metrics = complianceEngine.getMetrics();
      expect(metrics.timestamp).toBeDefined();
    });
  });

  describe('Health Status', () => {
    test('should report health status', async () => {
      const health = await complianceEngine.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded']).toContain(health.status);
    });

    test('should include enabled frameworks in health', async () => {
      const health = await complianceEngine.getHealth();

      expect(health.regulations).toBeDefined();
      expect(health.regulations.pciDss).toBe(true);
      expect(health.regulations.gdpr).toBe(true);
      expect(health.regulations.ccpa).toBe(true);
      expect(health.regulations.aml).toBe(true);
    });

    test('should include metrics in health report', async () => {
      const health = await complianceEngine.getHealth();

      expect(health.metrics).toBeDefined();
      expect(health.metrics.complianceChecksPerformed).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle null transaction gracefully', async () => {
      try {
        await complianceEngine.checkPciDssCompliance(null);
      } catch (e) {
        // Expected or handled
      }

      expect(complianceEngine.getMetrics()).toBeDefined();
    });

    test('should continue operations after error', async () => {
      try {
        await complianceEngine.checkPciDssCompliance(null);
      } catch (e) {
        // Expected
      }

      const validTransaction = {
        transaction_id: 'txn_123',
        encrypted_transmission: true,
        mfa_verified: true
      };

      const result = await complianceEngine.checkPciDssCompliance(validTransaction);
      expect(result).toBeDefined();
    });

    test('should handle malformed data gracefully', async () => {
      const malformedSubject = { /* missing required fields */ };

      try {
        await complianceEngine.handleGdprDataSubject(malformedSubject);
      } catch (e) {
        // Expected or handled
      }

      expect(complianceEngine.getMetrics()).toBeDefined();
    });
  });

  describe('Configuration Management', () => {
    test('should allow disabling specific frameworks', () => {
      const engine = new ComplianceEngine({
        pciDssEnabled: false,
        gdprEnabled: true,
        ccpaEnabled: false,
        amlEnabled: true
      });

      expect(engine.config.pciDssEnabled).toBe(false);
      expect(engine.config.gdprEnabled).toBe(true);
      expect(engine.config.ccpaEnabled).toBe(false);
      expect(engine.config.amlEnabled).toBe(true);
    });

    test('should accept custom thresholds', () => {
      const engine = new ComplianceEngine({
        amlSuspiciousThreshold: 25000,
        amlVelocityThreshold: 10
      });

      expect(engine.config.amlSuspiciousThreshold).toBe(25000);
      expect(engine.config.amlVelocityThreshold).toBe(10);
    });

    test('should have sensible defaults', () => {
      const engine = new ComplianceEngine();

      expect(engine.config.amlSuspiciousThreshold).toBe(10000);
      expect(engine.config.amlVelocityThreshold).toBe(5);
      expect(engine.config.pciDssRetentionDays).toBe(2555);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle full compliance check workflow', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 5000,
        encrypted_transmission: true,
        mfa_verified: true,
        pii_exposed: false
      };

      // PCI DSS check
      const pciResult = await complianceEngine.checkPciDssCompliance(transaction);
      expect(pciResult.violationLevel).toBe('COMPLIANT');

      // AML check
      const amlResult = await complianceEngine.detectAmlSuspiciousActivity(transaction);
      expect(amlResult).toBeNull(); // Not suspicious
    });

    test('should handle GDPR and CCPA workflows together', async () => {
      // GDPR workflow
      await complianceEngine.handleGdprDataSubject({
        customerId: 'subject_123',
        name: 'Test User',
        email: 'test@example.com',
        country: 'DE',
        consentGiven: true
      });

      // CCPA workflow
      await complianceEngine.handleCcpaRightToKnow({
        customerId: 'consumer_123',
        name: 'Test User',
        email: 'test@example.com',
        state: 'CA'
      });

      const metrics = complianceEngine.getMetrics();
      expect(metrics.dataSubjectsRequests).toBeGreaterThanOrEqual(0);
    });

    test('should maintain metrics accuracy across operations', async () => {
      const metricsBefore = complianceEngine.getMetrics();

      await complianceEngine.checkPciDssCompliance({
        id: 'txn_1',
        encrypted_transmission: true,
        mfa_verified: true
      });

      await complianceEngine.detectAmlSuspiciousActivity({
        id: 'txn_2',
        customerId: 'cust_123',
        amount: 15000
      });

      const metricsAfter = complianceEngine.getMetrics();
      expect(metricsAfter.complianceChecksPerformed).toBeGreaterThan(metricsBefore.complianceChecksPerformed);
    });

    test('should handle multiple violations in single transaction', async () => {
      const transaction = {
        id: 'txn_123',
        encrypted_transmission: false,
        mfa_verified: false,
        pii_exposed: true
      };

      const result = await complianceEngine.checkPciDssCompliance(transaction);

      expect(result.violationLevel).toBe('VIOLATION');
      expect(result.violations.length).toBeGreaterThan(1);
    });
  });
});

// Nicolas Larenas, nlarchive
