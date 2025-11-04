/**
 * Unit Tests for Risk Scoring Engine
 */

const RiskScoringEngine = require('../engine/risk-scoring-engine');

describe('Risk Scoring Engine', () => {
  let engine;

  beforeEach(() => {
    engine = new RiskScoringEngine();
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      expect(engine).toBeDefined();
      expect(engine.score).toBeDefined();
      expect(typeof engine.score).toBe('function');
    });

    test('should accept custom profiles', () => {
      engine.setProfile('conservative');
      expect(engine).toBeDefined();
      
      engine.setProfile('aggressive');
      expect(engine).toBeDefined();
    });
  });

  describe('Low-Risk Scoring', () => {
    test('should score low-risk transactions correctly', () => {
      const lowRisk = {
        amount: 50,
        is_foreign: 0,
        previous_txn_count_1h: 1,
        distance_from_home_km: 10,
        hour: 14,
        channel: 'mobile',
        avg_amount_7d: 60,
        device_id: 'D12345',
        merchant_id: 'M99999'
      };

      const result = engine.score(lowRisk);
      
      expect(result).toBeDefined();
      expect(result.proba).toBeDefined();
      expect(typeof result.proba).toBe('number');
      expect(result.proba).toBeLessThan(0.5);
      expect(result.prediction).toBe(0);
    });

    test('should have low probability for normal amount transactions', () => {
      const normalAmount = {
        amount: 100,
        is_foreign: 0,
        previous_txn_count_1h: 2,
        distance_from_home_km: 5,
        hour: 10,
        channel: 'pos',
        avg_amount_7d: 95,
        device_id: 'D11111',
        merchant_id: 'M11111'
      };

      const result = engine.score(normalAmount);
      expect(result.proba).toBeLessThan(0.5);
    });
  });

  describe('High-Risk Scoring', () => {
    test('should score high-risk transactions correctly', () => {
      const highRisk = {
        amount: 8000,
        is_foreign: 1,
        previous_txn_count_1h: 15,
        distance_from_home_km: 6000,
        hour: 3,
        channel: 'web',
        avg_amount_7d: 100,
        device_id: 'D98765',
        merchant_id: 'M12345'
      };

      const result = engine.score(highRisk);
      
      expect(result).toBeDefined();
      expect(result.proba).toBeGreaterThan(0.9);
      expect(result.prediction).toBe(1);
    });

    test('should detect large amounts as high risk', () => {
      const largeAmount = {
        amount: 10000,
        is_foreign: 0,
        previous_txn_count_1h: 1,
        distance_from_home_km: 0,
        hour: 12,
        channel: 'mobile',
        avg_amount_7d: 50,
        device_id: 'D12345',
        merchant_id: 'M99999'
      };

      const result = engine.score(largeAmount);
      expect(result.proba).toBeGreaterThan(0.5);
    });

    test('should detect foreign transactions as higher risk', () => {
      const foreignTxn = {
        amount: 500,
        is_foreign: 1,
        previous_txn_count_1h: 1,
        distance_from_home_km: 5000,
        hour: 12,
        channel: 'web',
        avg_amount_7d: 100,
        device_id: 'D12345',
        merchant_id: 'M99999'
      };

      const domesticTxn = { ...foreignTxn, is_foreign: 0, distance_from_home_km: 10 };
      
      const foreignResult = engine.score(foreignTxn);
      const domesticResult = engine.score(domesticTxn);
      
      expect(foreignResult.proba).toBeGreaterThan(domesticResult.proba);
    });
  });

  describe('Profile Switching', () => {
    test('should switch between profiles', () => {
      const txn = {
        amount: 2000,
        is_foreign: 1,
        previous_txn_count_1h: 6,
        distance_from_home_km: 1500,
        hour: 1,
        channel: 'web',
        avg_amount_7d: 150,
        device_id: 'D55555',
        merchant_id: 'M77777'
      };

      engine.setProfile('conservative');
      const conservativeResult = engine.score(txn);

      engine.setProfile('aggressive');
      const aggressiveResult = engine.score(txn);

      expect(conservativeResult.proba).toBeGreaterThan(aggressiveResult.proba);
    });

    test('should maintain profile settings across multiple scores', () => {
      engine.setProfile('conservative');
      
      const txn1 = engine.score({ amount: 1000, is_foreign: 0, previous_txn_count_1h: 1, distance_from_home_km: 10, hour: 14, channel: 'mobile', avg_amount_7d: 100, device_id: 'D1', merchant_id: 'M1' });
      const txn2 = engine.score({ amount: 2000, is_foreign: 0, previous_txn_count_1h: 2, distance_from_home_km: 20, hour: 15, channel: 'mobile', avg_amount_7d: 150, device_id: 'D2', merchant_id: 'M2' });
      
      expect(txn1.proba).toBeDefined();
      expect(txn2.proba).toBeDefined();
    });
  });

  describe('Risk Factors & Contributions', () => {
    test('should provide risk factor contributions', () => {
      const txn = {
        amount: 6000,
        is_foreign: 0,
        previous_txn_count_1h: 2,
        distance_from_home_km: 50,
        hour: 12,
        channel: 'pos',
        avg_amount_7d: 100,
        device_id: 'D11111',
        merchant_id: 'M88888'
      };

      const result = engine.score(txn);
      
      expect(result.contributions).toBeDefined();
      expect(result.contributions.amount_spike).toBeDefined();
      expect(result.contributions.amount_extreme).toBeDefined();
    });

    test('should list risk factors', () => {
      const txn = {
        amount: 6000,
        is_foreign: 1,
        previous_txn_count_1h: 10,
        distance_from_home_km: 2000,
        hour: 3,
        channel: 'web',
        avg_amount_7d: 100,
        device_id: 'D99999',
        merchant_id: 'M88888'
      };

      const result = engine.score(txn);
      
      expect(result.factors).toBeDefined();
      expect(typeof result.factors).toBe('string');
      expect(result.factors.length).toBeGreaterThan(0);
    });

    test('should identify amount spike factor', () => {
      const txn = {
        amount: 5000,
        is_foreign: 0,
        previous_txn_count_1h: 1,
        distance_from_home_km: 10,
        hour: 14,
        channel: 'mobile',
        avg_amount_7d: 50,
        device_id: 'D12345',
        merchant_id: 'M99999'
      };

      const result = engine.score(txn);
      expect(result.factors.includes('amt')).toBe(true);
    });
  });

  describe('Edge Cases & Error Handling', () => {
    test('should handle missing fields gracefully', () => {
      const incompleteTxn = {
        amount: 100
      };

      expect(() => engine.score(incompleteTxn)).not.toThrow();
    });

    test('should handle zero values', () => {
      const zeroTxn = {
        amount: 0,
        is_foreign: 0,
        previous_txn_count_1h: 0,
        distance_from_home_km: 0,
        hour: 0,
        channel: 'mobile',
        avg_amount_7d: 0,
        device_id: 'D12345',
        merchant_id: 'M99999'
      };

      const result = engine.score(zeroTxn);
      expect(result).toBeDefined();
      expect(result.proba).toBeDefined();
    });

    test('should handle extreme values', () => {
      const extremeTxn = {
        amount: 999999,
        is_foreign: 1,
        previous_txn_count_1h: 999,
        distance_from_home_km: 999999,
        hour: 23,
        channel: 'web',
        avg_amount_7d: 1,
        device_id: 'D99999',
        merchant_id: 'M99999'
      };

      const result = engine.score(extremeTxn);
      expect(result).toBeDefined();
      expect(result.proba).toBeGreaterThan(0);
      expect(result.proba).toBeLessThanOrEqual(1);
    });
  });

  describe('Threshold Management', () => {
    test('should apply threshold to predictions', () => {
      const borderlineTxn = {
        amount: 1500,
        is_foreign: 0,
        previous_txn_count_1h: 3,
        distance_from_home_km: 100,
        hour: 14,
        channel: 'mobile',
        avg_amount_7d: 200,
        device_id: 'D12345',
        merchant_id: 'M99999'
      };

      const result = engine.score(borderlineTxn);
      expect(result.prediction).toBeDefined();
      expect([0, 1]).toContain(result.prediction);
    });

    test('should return consistent predictions for same transaction', () => {
      const txn = {
        amount: 1000,
        is_foreign: 0,
        previous_txn_count_1h: 2,
        distance_from_home_km: 50,
        hour: 14,
        channel: 'mobile',
        avg_amount_7d: 150,
        device_id: 'D12345',
        merchant_id: 'M99999'
      };

      const result1 = engine.score(txn);
      const result2 = engine.score(txn);
      
      expect(result1.proba).toBe(result2.proba);
      expect(result1.prediction).toBe(result2.prediction);
    });
  });
});

// Nicolas Larenas, nlarchive
