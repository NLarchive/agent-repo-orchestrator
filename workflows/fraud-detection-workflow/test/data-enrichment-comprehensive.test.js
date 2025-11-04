/**
 * Data Enrichment Service - Comprehensive Unit Test Suite
 * Tests: Customer profiles, historical patterns, segmentation, external enrichment
 */

const DataEnrichmentService = require('../engine/data-enrichment');

// Mock the postgres module
jest.mock('postgres', () => {
  return jest.fn(function(connectionString) {
    let storage = {
      customer_profiles: [],
      transactions: []
    };

    const mockDb = jest.fn().mockImplementation(async function(strings, ...values) {
      const query = String(strings[0]).toLowerCase();

      // Handle customer profile queries
      if (query.includes('select') && query.includes('customer_profiles')) {
        const customerId = values[0];
        const profiles = storage.customer_profiles.filter(p => p.customer_id === customerId);
        if (profiles.length === 0) {
          return [];
        }
        return profiles;
      }

      // Handle transaction queries
      if (query.includes('select') && query.includes('transactions')) {
        const customerId = values[0];
        const lookbackDate = values[1];
        return storage.transactions.filter(t => 
          t.customer_id === customerId && 
          new Date(t.transaction_date) > new Date(lookbackDate)
        );
      }

      return [];
    });

    mockDb.end = jest.fn().mockResolvedValue(true);
    return mockDb;
  });
});

describe('Data Enrichment Service', () => {
  let enrichmentService;

  beforeEach(async () => {
    enrichmentService = new DataEnrichmentService({
      enableHistoricalAnalysis: true,
      enableCustomerSegmentation: true,
      enableExternalEnrichment: true,
      lookbackDays: 90,
      segmentationThresholds: {
        highValue: 10000,
        frequentUser: 10,
        riskThreshold: 0.7
      }
    });
    
    // Don't call initialize() - use mock directly
    // The mock postgres connection is already set up
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const service = new DataEnrichmentService();
      expect(service).toBeDefined();
      expect(service.config).toBeDefined();
    });

    test('should have all enrichment modules disabled/enabled as configured', () => {
      const service = new DataEnrichmentService({
        enableHistoricalAnalysis: false,
        enableExternalEnrichment: false
      });
      expect(service.config.enableHistoricalAnalysis).toBe(false);
      expect(service.config.enableExternalEnrichment).toBe(false);
      expect(service.config.enableCustomerSegmentation).toBe(true);
    });

    test('should initialize metrics', () => {
      expect(enrichmentService.metrics.enrichmentOperations).toBe(0);
      expect(enrichmentService.metrics.profilesRetrieved).toBe(0);
      expect(enrichmentService.metrics.patternsAnalyzed).toBe(0);
      expect(enrichmentService.metrics.segmentationsCategorized).toBe(0);
    });

    test('should initialize cache', () => {
      expect(enrichmentService.cache).toEqual(new Map());
      expect(enrichmentService.cacheExpiry).toEqual(new Map());
    });
  });

  describe('Transaction Enrichment', () => {
    beforeEach(() => {
      // Set up db mock for this group of tests
      enrichmentService.db = jest.fn().mockResolvedValue([]);
    });

    test('should enrich transaction with basic structure', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const enriched = await enrichmentService.enrichTransaction(transaction);

      expect(enriched).toBeDefined();
      expect(enriched.id).toBe('txn_123');
      expect(enriched.enrichment).toBeDefined();
      expect(enriched.enrichment.enrichmentScore).toBeGreaterThanOrEqual(0);
      expect(enriched.enrichment.enrichmentScore).toBeLessThanOrEqual(1);
    });

    test('should include profile enrichment', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const enriched = await enrichmentService.enrichTransaction(transaction);

      expect(enriched.enrichment.profile).toBeDefined();
      expect(enriched.enrichment.profile.customerId).toBe('cust_456');
    });

    test('should include pattern analysis', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const enriched = await enrichmentService.enrichTransaction(transaction);

      expect(enriched.enrichment.patterns).toBeDefined();
      expect(enriched.enrichment.patterns.transactionCount).toBeGreaterThanOrEqual(0);
    });

    test('should include customer segmentation', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const enriched = await enrichmentService.enrichTransaction(transaction);

      expect(enriched.enrichment.segmentation).toBeDefined();
      expect(enriched.enrichment.segmentation.segment).toBeDefined();
      expect(enriched.enrichment.segmentation.riskLevel).toBeDefined();
    });

    test('should include external enrichment data', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const enriched = await enrichmentService.enrichTransaction(transaction);

      expect(enriched.enrichment.externalData).toBeDefined();
      expect(enriched.enrichment.externalData.creditScore).toBeDefined();
      expect(enriched.enrichment.externalData.riskScore).toBeGreaterThanOrEqual(0);
      expect(enriched.enrichment.externalData.riskScore).toBeLessThanOrEqual(1);
    });

    test('should track enrichment operations in metrics', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const operationsBefore = enrichmentService.metrics.enrichmentOperations;
      await enrichmentService.enrichTransaction(transaction);
      const operationsAfter = enrichmentService.metrics.enrichmentOperations;

      expect(operationsAfter).toBeGreaterThan(operationsBefore);
    });

    test('should reject transaction without customerId', async () => {
      const transaction = {
        id: 'txn_123',
        amount: 500
      };

      await expect(enrichmentService.enrichTransaction(transaction)).rejects.toThrow();
    });

    test('should handle enrichment errors gracefully', async () => {
      const service = new DataEnrichmentService({
        enableHistoricalAnalysis: true
      });

      service.db = jest.fn().mockResolvedValue([]);

      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      // Even with errors, should return enriched transaction
      const enriched = await service.enrichTransaction(transaction);
      expect(enriched).toBeDefined();
      expect(enriched.enrichment).toBeDefined();
    });
  });

  describe('Customer Profiles', () => {
    test('should return default profile for unknown customer', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const profile = await enrichmentService.getCustomerProfile('unknown_customer');

      expect(profile).toBeDefined();
      expect(profile.customerId).toBe('unknown_customer');
      expect(profile.enrichmentScore).toBe(0.3);
      expect(profile.accountAge).toBe(0);
      expect(profile.totalTransactions).toBe(0);
    });

    test('should cache customer profiles when found in database', async () => {
      // Mock a profile from database
      const mockProfile = {
        customer_id: 'cust_789',
        customer_name: 'Test Customer',
        account_age: 365,
        total_transactions: 50,
        avg_transaction_amount: 1000,
        account_status: 'ACTIVE',
        kycStatus: 'APPROVED',
        pep_status: false,
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        last_transaction_date: new Date()
      };

      enrichmentService.db = jest.fn().mockResolvedValue([mockProfile]);
      
      const cacheMissBefore = enrichmentService.metrics.cacheMisses;
      const cacheSize = enrichmentService.cache.size;

      // First call should be cache miss and populate cache
      await enrichmentService.getCustomerProfile('cust_789');
      expect(enrichmentService.metrics.cacheMisses).toBeGreaterThan(cacheMissBefore);
      expect(enrichmentService.cache.size).toBeGreaterThan(cacheSize);

      const cacheHitBefore = enrichmentService.metrics.cacheHits;

      // Second call should be cache hit
      await enrichmentService.getCustomerProfile('cust_789');
      expect(enrichmentService.metrics.cacheHits).toBeGreaterThan(cacheHitBefore);
    });

    test('should clear customer cache', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const mockProfile = {
        customer_id: 'cust_999',
        customer_name: 'Test',
        account_age: 365,
        total_transactions: 50,
        avg_transaction_amount: 1000,
        account_status: 'ACTIVE',
        kycStatus: 'APPROVED',
        pep_status: false,
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        last_transaction_date: new Date()
      };

      enrichmentService.db = jest.fn().mockResolvedValue([mockProfile]);
      const cacheSize = enrichmentService.cache.size;

      await enrichmentService.getCustomerProfile('cust_999');
      expect(enrichmentService.cache.size).toBeGreaterThan(cacheSize);

      enrichmentService.clearCustomerCache('cust_999');
      expect(enrichmentService.cache.has('profile:cust_999')).toBe(false);
    });

    test('should clear all cache', async () => {
      const mockProfile1 = {
        customer_id: 'cust_111',
        customer_name: 'Test1',
        account_age: 365,
        total_transactions: 50,
        avg_transaction_amount: 1000,
        account_status: 'ACTIVE',
        kycStatus: 'APPROVED',
        pep_status: false,
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        last_transaction_date: new Date()
      };

      const mockProfile2 = {
        customer_id: 'cust_222',
        customer_name: 'Test2',
        account_age: 180,
        total_transactions: 25,
        avg_transaction_amount: 500,
        account_status: 'ACTIVE',
        kycStatus: 'APPROVED',
        pep_status: false,
        created_at: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        last_transaction_date: new Date()
      };

      enrichmentService.db = jest.fn()
        .mockResolvedValueOnce([mockProfile1])
        .mockResolvedValueOnce([mockProfile2]);

      await enrichmentService.getCustomerProfile('cust_111');
      await enrichmentService.getCustomerProfile('cust_222');

      expect(enrichmentService.cache.size).toBeGreaterThan(0);

      enrichmentService.clearAllCache();
      expect(enrichmentService.cache.size).toBe(0);
    });
  });

  describe('Historical Pattern Analysis', () => {
    test('should analyze transaction patterns', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      const patterns = await enrichmentService.analyzeHistoricalPatterns(transaction);

      expect(patterns).toBeDefined();
      expect(patterns.transactionCount).toBeGreaterThanOrEqual(0);
      expect(patterns.anomalyScore).toBeGreaterThanOrEqual(0);
      expect(patterns.anomalyScore).toBeLessThanOrEqual(1);
    });

    test('should return zero patterns for new customer', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transaction = {
        id: 'txn_123',
        customerId: 'new_customer',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      const patterns = await enrichmentService.analyzeHistoricalPatterns(transaction);

      expect(patterns.transactionCount).toBe(0);
      expect(patterns.anomalyScore).toBe(0);
    });

    test('should track pattern analysis metrics', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      const analysisBefore = enrichmentService.metrics.patternsAnalyzed;
      await enrichmentService.analyzeHistoricalPatterns(transaction);
      const analysisAfter = enrichmentService.metrics.patternsAnalyzed;

      expect(analysisAfter).toBeGreaterThan(analysisBefore);
    });
  });

  describe('Customer Segmentation', () => {
    test('should categorize new account as risky', async () => {
      const profile = {
        accountAge: 5,
        totalTransactions: 2,
        avgTransactionAmount: 100,
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
        pepStatus: false
      };

      const segment = await enrichmentService.categorizeCustomerSegment('cust_123', profile);

      expect(segment.segment).toBe('NEW_ACCOUNT');
      expect(segment.riskLevel).toBe('HIGH');
    });

    test('should categorize frequent user as low risk', async () => {
      const profile = {
        accountAge: 365,
        totalTransactions: 50,
        avgTransactionAmount: 500,
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
        pepStatus: false
      };

      const segment = await enrichmentService.categorizeCustomerSegment('cust_123', profile);

      expect(segment.segment).toBe('FREQUENT_USER');
      expect(segment.riskLevel).toBe('LOW');
    });

    test('should categorize high-value customer', async () => {
      const profile = {
        accountAge: 365,
        totalTransactions: 100,
        avgTransactionAmount: 15000,
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
        pepStatus: false
      };

      const segment = await enrichmentService.categorizeCustomerSegment('cust_123', profile);

      expect(segment.segment).toBe('HIGH_VALUE');
      expect(segment.riskLevel).toBe('LOW');
    });

    test('should increase risk for PEP status', async () => {
      const profile = {
        accountAge: 365,
        totalTransactions: 50,
        avgTransactionAmount: 500,
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
        pepStatus: true
      };

      const segment = await enrichmentService.categorizeCustomerSegment('cust_123', profile);

      expect(segment.riskLevel).toBe('HIGH');
    });

    test('should track segmentation metrics', async () => {
      const profile = {
        accountAge: 365,
        totalTransactions: 50,
        avgTransactionAmount: 500,
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
        pepStatus: false
      };

      const segmentationBefore = enrichmentService.metrics.segmentationsCategorized;
      await enrichmentService.categorizeCustomerSegment('cust_123', profile);
      const segmentationAfter = enrichmentService.metrics.segmentationsCategorized;

      expect(segmentationAfter).toBeGreaterThan(segmentationBefore);
    });

    test('should handle null profile gracefully', async () => {
      const segment = await enrichmentService.categorizeCustomerSegment('cust_123', null);

      expect(segment).toBeDefined();
      expect(segment.segment).toBe('UNKNOWN');
      expect(segment.riskLevel).toBe('MEDIUM');
    });
  });

  describe('External Enrichment', () => {
    test('should retrieve external enrichment data', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500
      };

      const externalData = await enrichmentService.getExternalEnrichmentData(transaction);

      expect(externalData).toBeDefined();
      expect(externalData.creditScore).toBeDefined();
      expect(externalData.creditScore).toBeGreaterThanOrEqual(600);
      expect(externalData.creditScore).toBeLessThanOrEqual(1000);
      expect(externalData.sanctionsListMatch).toBeDefined();
      expect(externalData.riskScore).toBeGreaterThanOrEqual(0);
      expect(externalData.riskScore).toBeLessThanOrEqual(1);
    });

    test('should calculate risk score correctly', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500
      };

      const externalData = await enrichmentService.getExternalEnrichmentData(transaction);

      expect(externalData.riskScore).toBeGreaterThanOrEqual(0);
      expect(externalData.riskScore).toBeLessThanOrEqual(1);
    });

    test('should track external enrichment metrics', async () => {
      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500
      };

      const integrationBefore = enrichmentService.metrics.externalDataIntegrated;
      await enrichmentService.getExternalEnrichmentData(transaction);
      const integrationAfter = enrichmentService.metrics.externalDataIntegrated;

      expect(integrationAfter).toBeGreaterThan(integrationBefore);
    });
  });

  describe('Batch Enrichment', () => {
    test('should enrich batch of transactions', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transactions = [
        { id: 'txn_1', customerId: 'cust_1', amount: 100, merchantCategory: 'RETAIL', country: 'US' },
        { id: 'txn_2', customerId: 'cust_2', amount: 200, merchantCategory: 'FOOD', country: 'US' },
        { id: 'txn_3', customerId: 'cust_3', amount: 300, merchantCategory: 'TRAVEL', country: 'CA' }
      ];

      const enriched = await enrichmentService.enrichBatch(transactions);

      expect(enriched).toHaveLength(3);
      expect(enriched[0].enrichment).toBeDefined();
      expect(enriched[1].enrichment).toBeDefined();
      expect(enriched[2].enrichment).toBeDefined();
    });

    test('should handle failed enrichments in batch', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transactions = [
        { id: 'txn_1', customerId: 'cust_1', amount: 100, merchantCategory: 'RETAIL', country: 'US' },
        { id: 'txn_2', amount: 200 }, // Missing customerId
        { id: 'txn_3', customerId: 'cust_3', amount: 300, merchantCategory: 'TRAVEL', country: 'CA' }
      ];

      const enriched = await enrichmentService.enrichBatch(transactions);

      expect(enriched).toHaveLength(3);
      // First and third should have enrichment, second should be returned as-is
      expect(enriched[0].enrichment).toBeDefined();
      expect(enriched[2].enrichment).toBeDefined();
    });

    test('should skip enrichment when disabled', async () => {
      const service = new DataEnrichmentService({
        enableHistoricalAnalysis: false,
        enableCustomerSegmentation: false,
        enableExternalEnrichment: false
      });

      service.db = jest.fn().mockResolvedValue([]);

      const transaction = {
        id: 'txn_123',
        customerId: 'cust_456',
        amount: 500,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      const enriched = await service.enrichTransaction(transaction);

      expect(enriched.enrichment.profile).toBeNull();
      expect(enriched.enrichment.patterns).toBeNull();
      expect(enriched.enrichment.externalData).toBeNull();
    });
  });

  describe('Metrics & Health', () => {
    test('should return current metrics', () => {
      const metrics = enrichmentService.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.enrichmentOperations).toBeGreaterThanOrEqual(0);
      expect(metrics.profilesRetrieved).toBeGreaterThanOrEqual(0);
      expect(metrics.timestamp).toBeDefined();
      expect(metrics.cacheSize).toBeGreaterThanOrEqual(0);
    });

    test('should report health status', async () => {
      const health = await enrichmentService.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.enrichmentEnabled).toBe(true);
    });

    test('should include feature flags in health', async () => {
      const health = await enrichmentService.getHealth();

      expect(health.enrichmentEnabled).toBeDefined();
      expect(health.historyAnalysisEnabled).toBeDefined();
      expect(health.externalEnrichmentEnabled).toBeDefined();
    });

    test('should include metrics in health report', async () => {
      const health = await enrichmentService.getHealth();

      expect(health.metrics).toBeDefined();
      expect(health.metrics.enrichmentOperations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Configuration', () => {
    test('should use custom segmentation thresholds', () => {
      const service = new DataEnrichmentService({
        segmentationThresholds: {
          highValue: 50000,
          frequentUser: 20,
          riskThreshold: 0.5
        }
      });

      expect(service.config.segmentationThresholds.highValue).toBe(50000);
      expect(service.config.segmentationThresholds.frequentUser).toBe(20);
    });

    test('should disable features selectively', () => {
      const service = new DataEnrichmentService({
        enableHistoricalAnalysis: false,
        enableExternalEnrichment: true,
        enableCustomerSegmentation: true
      });

      expect(service.config.enableHistoricalAnalysis).toBe(false);
      expect(service.config.enableExternalEnrichment).toBe(true);
      expect(service.config.enableCustomerSegmentation).toBe(true);
    });

    test('should use lookback period from config', () => {
      const service = new DataEnrichmentService({
        lookbackDays: 180
      });

      expect(service.config.lookbackDays).toBe(180);
    });
  });

  describe('Integration Scenarios', () => {
    test('should enrich transaction with all components', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transaction = {
        id: 'txn_complete',
        customerId: 'cust_complete',
        amount: 5000,
        merchantCategory: 'ELECTRONICS',
        country: 'US',
        timestamp: new Date()
      };

      const enriched = await enrichmentService.enrichTransaction(transaction);

      // Verify all enrichment components are present
      expect(enriched.enrichment.profile).toBeDefined();
      expect(enriched.enrichment.patterns).toBeDefined();
      expect(enriched.enrichment.segmentation).toBeDefined();
      expect(enriched.enrichment.externalData).toBeDefined();
      expect(enriched.enrichment.enrichmentScore).toBeGreaterThan(0);
    });

    test('should maintain enrichment score between 0 and 1', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transactions = Array.from({ length: 20 }, (_, i) => ({
        id: `txn_${i}`,
        customerId: `cust_${i}`,
        amount: Math.random() * 50000,
        merchantCategory: ['RETAIL', 'FOOD', 'TRAVEL', 'ELECTRONICS'][Math.floor(Math.random() * 4)],
        country: ['US', 'CA', 'MX', 'UK'][Math.floor(Math.random() * 4)]
      }));

      const enrichedBatch = await enrichmentService.enrichBatch(transactions);

      enrichedBatch.forEach(t => {
        if (t.enrichment) {
          expect(t.enrichment.enrichmentScore).toBeGreaterThanOrEqual(0);
          expect(t.enrichment.enrichmentScore).toBeLessThanOrEqual(1);
        }
      });
    });

    test('should provide consistent enrichment for same customer', async () => {
      enrichmentService.db = jest.fn().mockResolvedValue([]);
      const transaction1 = {
        id: 'txn_a',
        customerId: 'consistent_cust',
        amount: 1000,
        merchantCategory: 'RETAIL',
        country: 'US'
      };

      const transaction2 = {
        id: 'txn_b',
        customerId: 'consistent_cust',
        amount: 2000,
        merchantCategory: 'FOOD',
        country: 'US'
      };

      const enriched1 = await enrichmentService.enrichTransaction(transaction1);
      const enriched2 = await enrichmentService.enrichTransaction(transaction2);

      // Same customer should have same profile (cached)
      expect(enriched1.enrichment.profile.customerId).toBe(enriched2.enrichment.profile.customerId);
    });
  });
});

// Nicolas Larenas, nlarchive
