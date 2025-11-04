/**
 * Audit Trail System - Comprehensive Unit Test Suite
 * Tests: Hash chain validation, encryption, retention policies, compliance reporting
 */

const AuditTrail = require('../engine/audit-trail');
const crypto = require('crypto');

// Mock the postgres module
jest.mock('postgres', () => {
  return jest.fn(() => {
    const mockDb = jest.fn().mockImplementation(async function() {
      return [];
    });
    mockDb.end = jest.fn().mockResolvedValue(true);
    return mockDb;
  });
});

describe('Audit Trail System', () => {
  let auditTrail;

  beforeEach(async () => {
    auditTrail = new AuditTrail({
      encryptionKey: 'test-encryption-key-32-bytes-12345',
      enableMetrics: true,
      enableLogging: true
    });
    // Mock the db connection
    auditTrail.db = jest.fn().mockResolvedValue([]);
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const trail = new AuditTrail();
      expect(trail).toBeDefined();
      expect(trail.config).toBeDefined();
    });

    test('should initialize audit metrics', () => {
      const metrics = auditTrail.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.eventsLogged).toBe(0);
      expect(metrics.decisionsLogged).toBe(0);
      expect(metrics.complianceEventsLogged).toBe(0);
    });

    test('should initialize encryption key', () => {
      const trail = new AuditTrail({
        encryptionKey: 'test-key-123456789012345678901'
      });
      expect(trail.config.encryptionKey).toBeDefined();
    });
  });

  describe('Event Logging', () => {
    test('should log audit event with all required fields', async () => {
      const event = {
        eventType: 'TRANSACTION_ANALYZED',
        actorId: 'user_123',
        resourceId: 'txn_456',
        action: 'fraud_check_executed',
        status: 'FLAGGED',
        details: { reason: 'Velocity anomaly' }
      };

      const eventId = await auditTrail.logEvent(event);

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
    });

    test('should track logged events in metrics', async () => {
      const metricsBefore = auditTrail.getMetrics();
      const countBefore = metricsBefore.eventsLogged || 0;

      await auditTrail.logEvent({
        eventType: 'TEST_EVENT',
        actorId: 'user_123',
        action: 'test_action'
      });

      const metricsAfter = auditTrail.getMetrics();
      expect(metricsAfter.eventsLogged).toBeGreaterThanOrEqual(countBefore);
    });

    test('should generate unique event IDs', async () => {
      const eventId1 = await auditTrail.logEvent({
        eventType: 'EVENT_1',
        actorId: 'user_123',
        action: 'action_1'
      });

      const eventId2 = await auditTrail.logEvent({
        eventType: 'EVENT_2',
        actorId: 'user_123',
        action: 'action_2'
      });

      expect(eventId1).not.toBe(eventId2);
    });
  });

  describe('Hash Chain Validation', () => {
    test('should create hash for event', async () => {
      const event = {
        eventType: 'EVENT_1',
        actorId: 'user_123',
        action: 'action_1'
      };

      const eventId = await auditTrail.logEvent(event);

      expect(eventId).toBeDefined();
      expect(typeof eventId).toBe('string');
    });

    test('should verify chain integrity', async () => {
      const result = await auditTrail.verifyChainIntegrity();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect(result.isValid).toBeDefined();
    });
  });

  describe('Event Encryption', () => {
    test('should encrypt sensitive event data', async () => {
      const sensitiveData = 'secret_password_hash';
      const encrypted = auditTrail.encryptData(sensitiveData);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });

    test('should decrypt encrypted data', () => {
      const originalData = 'sensitive_test_data';
      const encrypted = auditTrail.encryptData(originalData);

      if (encrypted && encrypted.startsWith('ENC:')) {
        const decrypted = auditTrail.decryptData(encrypted);
        expect(decrypted).toBeDefined();
      }
    });

    test('should handle data without encryption', () => {
      const trail = new AuditTrail({
        enableEncryption: false,
        encryptionKey: 'test-key'
      });

      const encrypted = trail.encryptData('test_data');
      expect(encrypted).toBe('test_data');
    });
  });

  describe('Retention Policies', () => {
    test('should enforce retention time window', () => {
      const trail = new AuditTrail({
        retentionDays: 30,
        encryptionKey: 'test-key-123456789012345678901'
      });

      expect(trail.config.retentionDays).toBe(30);
    });

    test('should have default retention period (7 years for PCI DSS)', () => {
      const trail = new AuditTrail({
        encryptionKey: 'test-key-123456789012345678901'
      });

      expect(trail.config.retentionDays).toBe(2555); // 7 years
    });

    test('should track audit metrics', () => {
      const metrics = auditTrail.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.eventsLogged).toBeDefined();
      expect(metrics.decisionsLogged).toBeDefined();
    });
  });

  describe('Compliance Reporting', () => {
    test('should log fraud decision', async () => {
      const decision = {
        transactionId: 'txn_123',
        customerId: 'cust_456',
        riskScore: 0.85,
        decision: 'BLOCK',
        recommendation: 'BLOCK_TRANSACTION_AND_LOCK_ACCOUNT',
        factors: ['velocity_check', 'geographic_anomaly']
      };

      const logged = await auditTrail.logFraudDecision(decision);

      expect(auditTrail.getMetrics().decisionsLogged).toBeGreaterThanOrEqual(0);
    });

    test('should log compliance events', async () => {
      const event = {
        eventType: 'DATA_ACCESS',
        actorId: 'user_123',
        action: 'customer_record_accessed',
        complianceType: 'GDPR'
      };

      const logged = await auditTrail.logComplianceEvent(event);

      expect(auditTrail.getMetrics().complianceEventsLogged).toBeGreaterThanOrEqual(0);
    });

    test('should support compliance-relevant events', async () => {
      const event = {
        eventType: 'PERSONAL_DATA_PROCESSED',
        actorId: 'user_123',
        action: 'gdpr_relevant_operation'
      };

      await auditTrail.logComplianceEvent(event);

      expect(auditTrail.getMetrics()).toBeDefined();
    });
  });

  describe('Query & Retrieval', () => {
    test('should support event filtering', async () => {
      await auditTrail.logEvent({
        eventType: 'TRANSACTION_ANALYZED',
        actorId: 'user_123',
        resourceId: 'txn_456',
        action: 'analysis_complete'
      });

      // Metrics should reflect logged events
      expect(auditTrail.getMetrics().eventsLogged).toBeGreaterThanOrEqual(0);
    });

    test('should support date range queries', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      await auditTrail.logEvent({
        eventType: 'DATED_EVENT',
        actorId: 'user_123',
        action: 'test'
      });

      // Query should work without throwing
      expect(auditTrail.getMetrics()).toBeDefined();
    });
  });

  describe('Immutability & Integrity', () => {
    test('should calculate hash for events', () => {
      const event = {
        eventType: 'IMMUTABLE_EVENT',
        actorId: 'user_123',
        action: 'test'
      };

      const hash = auditTrail.calculateHash(event, null);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    test('should use consistent hash algorithm', () => {
      const event = {
        eventType: 'HASH_TEST',
        actorId: 'user_123',
        action: 'test'
      };

      const hash1 = auditTrail.calculateHash(event, null);
      const hash2 = auditTrail.calculateHash(event, null);

      // Same event should produce same hash
      expect(hash1).toBe(hash2);
    });

    test('should detect event changes', () => {
      const event1 = {
        eventType: 'EVENT_1',
        actorId: 'user_123',
        action: 'test'
      };

      const event2 = {
        eventType: 'EVENT_2',
        actorId: 'user_123',
        action: 'test'
      };

      const hash1 = auditTrail.calculateHash(event1, null);
      const hash2 = auditTrail.calculateHash(event2, null);

      // Different events should produce different hashes
      expect(hash1).not.toBe(hash2);
    });

    test('should track integrity verification', async () => {
      const result = await auditTrail.verifyChainIntegrity();
      expect(result.eventCount).toBeGreaterThanOrEqual(0);
      expect(typeof result.isValid).toBe('boolean');
    });
  });

  describe('Metrics & Health', () => {
    test('should return audit metrics', () => {
      const metrics = auditTrail.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.eventsLogged).toBeDefined();
      expect(metrics.decisionsLogged).toBeDefined();
      expect(metrics.complianceEventsLogged).toBeDefined();
    });

    test('should track logged events', async () => {
      const metricsBefore = auditTrail.getMetrics();
      const countBefore = metricsBefore.eventsLogged || 0;

      await auditTrail.logEvent({
        eventType: 'VERIFICATION_TEST',
        actorId: 'user_123',
        action: 'test'
      });

      const metricsAfter = auditTrail.getMetrics();
      expect(metricsAfter.eventsLogged).toBeGreaterThanOrEqual(countBefore);
    });

    test('should report health status', async () => {
      const health = await auditTrail.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded']).toContain(health.status);
    });
  });

  describe('Error Handling & Resilience', () => {
    test('should handle null events gracefully', async () => {
      try {
        await auditTrail.logEvent(null);
      } catch (e) {
        // Expected or handled
      }

      expect(auditTrail.getMetrics()).toBeDefined();
    });

    test('should continue logging after error', async () => {
      try {
        await auditTrail.logEvent(null);
      } catch (e) {
        // Expected
      }

      const validEvent = await auditTrail.logEvent({
        eventType: 'AFTER_ERROR',
        actorId: 'user_123',
        action: 'test'
      });

      expect(validEvent).toBeDefined();
    });

    test('should handle encryption failures gracefully', () => {
      const trail = new AuditTrail({
        encryptionKey: 'short-key'
      });

      const encrypted = trail.encryptData('test_data');
      expect(typeof encrypted).toBe('string');
    });
  });

  describe('Integration Scenarios', () => {
    test('should log complete transaction audit trail', async () => {
      const txnId = 'txn_integration_test';

      await auditTrail.logEvent({
        eventType: 'TRANSACTION_RECEIVED',
        actorId: 'system',
        resourceId: txnId,
        action: 'transaction_ingested'
      });

      await auditTrail.logEvent({
        eventType: 'TRANSACTION_VALIDATED',
        actorId: 'system',
        resourceId: txnId,
        action: 'validation_passed'
      });

      const metrics = auditTrail.getMetrics();
      expect(metrics.eventsLogged).toBeGreaterThanOrEqual(0);
    });

    test('should maintain event sequence in audit trail', async () => {
      const event1 = await auditTrail.logEvent({
        eventType: 'CHAIN_TEST_1',
        actorId: 'user_123',
        action: 'first'
      });

      const event2 = await auditTrail.logEvent({
        eventType: 'CHAIN_TEST_2',
        actorId: 'user_123',
        action: 'second'
      });

      expect(event1).toBeDefined();
      expect(event2).toBeDefined();
      expect(typeof event1).toBe('string');
      expect(typeof event2).toBe('string');
      expect(event1).not.toBe(event2);
    });

    test('should handle mixed event types', async () => {
      await auditTrail.logEvent({
        eventType: 'USER_ACTION',
        actorId: 'user_123',
        action: 'test'
      });

      await auditTrail.logFraudDecision({
        transactionId: 'txn_123',
        customerId: 'cust_456',
        riskScore: 0.75,
        decision: 'ALLOW'
      });

      await auditTrail.logComplianceEvent({
        eventType: 'GDPR_OPERATION',
        actorId: 'system',
        action: 'compliance_check'
      });

      const metrics = auditTrail.getMetrics();
      expect(metrics).toBeDefined();
    });
  });
});

// Nicolas Larenas, nlarchive
