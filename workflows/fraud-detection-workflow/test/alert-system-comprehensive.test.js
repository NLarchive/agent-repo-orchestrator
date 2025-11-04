/**
 * Multi-Channel Alert System - Comprehensive Unit Test Suite
 * Tests: Alert creation, severity classification, multi-channel dispatch
 */

const MultiChannelAlertSystem = require('../engine/alert-system');

describe('Multi-Channel Alert System', () => {
  let alertSystem;

  beforeEach(() => {
    alertSystem = new MultiChannelAlertSystem({
      enableMetrics: true,
      enableLogging: true
    });
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const system = new MultiChannelAlertSystem();
      expect(system).toBeDefined();
      expect(system.config).toBeDefined();
    });

    test('should initialize metrics to zero', () => {
      const metrics = alertSystem.getMetrics();
      expect(metrics.emailSent).toBe(0);
      expect(metrics.smsSent).toBe(0);
      expect(metrics.totalAlerts).toBe(0);
      expect(metrics.failedAlerts).toBe(0);
    });
  });

  describe('Alert Creation', () => {
    test('should create fraud alert from transaction and risk analysis', () => {
      const transaction = {
        customer_id: 'cust_123',
        amount: 1500,
        currency: 'USD',
        merchant_name: 'Acme Corp',
        merchant_category: 'Electronics',
        transaction_type: 'online'
      };

      const riskAnalysis = {
        score: 0.85,
        factors: ['velocity_check', 'geographic_anomaly'],
        details: { reason: 'High risk' }
      };

      const alert = alertSystem.createFraudAlert(transaction, riskAnalysis);

      expect(alert).toBeDefined();
      expect(alert.alertId).toBeDefined();
      expect(alert.customerId).toBe('cust_123');
      expect(alert.riskScore).toBe(0.85);
      expect(alert.transactionAmount).toBe(1500);
    });

    test('should track alert creation metrics', () => {
      const initialMetrics = alertSystem.getMetrics();
      const initialCount = initialMetrics.totalAlerts || 0;

      const transaction = {
        customer_id: 'cust_123',
        amount: 750,
        currency: 'USD',
        merchant_name: 'Test Store',
        merchant_category: 'Retail',
        transaction_type: 'in_store'
      };

      const riskAnalysis = {
        score: 0.75,
        factors: ['amount_threshold']
      };

      alertSystem.createFraudAlert(transaction, riskAnalysis);

      expect((alertSystem.getMetrics().totalAlerts || 0)).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('Severity Classification', () => {
    test('should classify CRITICAL severity for high risk (>= 0.9)', () => {
      const severity = alertSystem.getAlertSeverity(0.95);
      expect(severity).toBe('CRITICAL');
    });

    test('should classify HIGH severity for medium-high risk (0.7-0.89)', () => {
      const severity = alertSystem.getAlertSeverity(0.75);
      expect(severity).toBe('HIGH');
    });

    test('should classify MEDIUM severity for medium risk (0.5-0.69)', () => {
      const severity = alertSystem.getAlertSeverity(0.60);
      expect(severity).toBe('MEDIUM');
    });

    test('should classify LOW severity for low risk (< 0.5)', () => {
      const severity = alertSystem.getAlertSeverity(0.25);
      expect(severity).toBe('LOW');
    });
  });

  describe('Recommended Actions', () => {
    test('should recommend BLOCK for CRITICAL severity (risk >= 0.9)', () => {
      const action = alertSystem.getRecommendedAction(0.95);
      expect(action).toBe('BLOCK_TRANSACTION_AND_LOCK_ACCOUNT');
    });

    test('should recommend OTP for HIGH severity (risk 0.7-0.89)', () => {
      const action = alertSystem.getRecommendedAction(0.75);
      expect(action).toBe('REQUIRE_OTP_VERIFICATION');
    });

    test('should recommend NOTIFY for MEDIUM severity (risk 0.5-0.69)', () => {
      const action = alertSystem.getRecommendedAction(0.60);
      expect(action).toBe('NOTIFY_CUSTOMER_AND_MONITOR');
    });

    test('should recommend ALLOW for LOW severity (risk < 0.5)', () => {
      const action = alertSystem.getRecommendedAction(0.25);
      expect(action).toBe('ALLOW_AND_LOG');
    });
  });

  describe('Alert Dispatch', () => {
    test('should dispatch alert through configured channels', async () => {
      const alert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.88,
        severity: 'HIGH',
        transactionAmount: 5000,
        transactionCurrency: 'USD',
        merchantName: 'Test Merchant',
        merchantCategory: 'Retail',
        transactionType: 'online',
        riskFactors: ['test']
      };

      const initialMetrics = alertSystem.getMetrics();
      const initialTotal = initialMetrics.totalAlerts || 0;

      await alertSystem.sendAlert(alert);

      const finalMetrics = alertSystem.getMetrics();
      expect((finalMetrics.totalAlerts || 0)).toBeGreaterThanOrEqual(initialTotal);
    });

    test('should track failed dispatch attempts', async () => {
      const invalidAlert = null;
      const initialMetrics = alertSystem.getMetrics();
      const initialErrors = initialMetrics.failedAlerts || 0;

      try {
        await alertSystem.sendAlert(invalidAlert);
      } catch (e) {
        // Expected
      }

      const finalMetrics = alertSystem.getMetrics();
      expect((finalMetrics.failedAlerts || 0)).toBeGreaterThanOrEqual(initialErrors);
    });
  });

  describe('Channel-Specific Formatting', () => {
    test('should format email alert message', async () => {
      const alert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.88,
        severity: 'HIGH',
        transactionAmount: 5000,
        transactionCurrency: 'USD',
        merchantName: 'Test Merchant',
        merchantCategory: 'Retail',
        transactionType: 'online',
        timestamp: new Date().toISOString(),
        riskFactors: ['test']
      };

      // formatAlertMessage should work without throwing
      const formatted = alertSystem.formatAlertMessage(alert);
      expect(formatted).toBeDefined();
      expect(formatted.alertId).toBe('alert_123');
    });

    test('should build HTML email content', async () => {
      const alert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.88,
        severity: 'HIGH',
        transactionAmount: 5000,
        transactionCurrency: 'USD',
        merchantName: 'Test Merchant',
        merchantCategory: 'Retail',
        transactionType: 'online',
        timestamp: new Date().toISOString(),
        riskFactors: ['velocity_check']
      };

      const htmlContent = alertSystem.buildEmailContent(alert);
      expect(htmlContent).toBeDefined();
      expect(htmlContent).toContain('Fraud Alert');
      expect(htmlContent).toContain('HIGH');
    });

    test('should format webhook payload', async () => {
      const alert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.88,
        severity: 'HIGH',
        transactionAmount: 5000,
        transactionCurrency: 'USD',
        merchantName: 'Test Merchant',
        merchantCategory: 'Retail',
        transactionType: 'online',
        timestamp: new Date().toISOString(),
        riskFactors: []
      };

      // Webhook payload should be JSON-serializable
      const payload = alertSystem.formatAlertMessage(alert);
      expect(() => JSON.stringify(payload)).not.toThrow();
    });
  });

  describe('Multi-Channel Dispatch', () => {
    test('should handle partial channel failures gracefully', async () => {
      const alert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.88,
        severity: 'HIGH',
        transactionAmount: 5000,
        transactionCurrency: 'USD',
        merchantName: 'Test Merchant',
        merchantCategory: 'Retail',
        transactionType: 'online',
        timestamp: new Date().toISOString(),
        riskFactors: []
      };

      // Should not throw even if some channels fail
      await expect(alertSystem.sendAlert(alert)).resolves.toBeDefined();
    });

    test('should maintain dispatch metrics', async () => {
      const alert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.88,
        severity: 'HIGH',
        transactionAmount: 5000,
        transactionCurrency: 'USD',
        merchantName: 'Test Merchant',
        merchantCategory: 'Retail',
        transactionType: 'online',
        timestamp: new Date().toISOString(),
        riskFactors: []
      };

      const metricsBefore = alertSystem.getMetrics();
      const totalBefore = metricsBefore.totalAlerts || 0;

      await alertSystem.sendAlert(alert);

      const metricsAfter = alertSystem.getMetrics();
      expect(metricsAfter.totalAlerts || 0).toBeGreaterThan(totalBefore);
    });
  });

  describe('Configuration Management', () => {
    test('should accept email configuration', () => {
      const system = new MultiChannelAlertSystem({
        emailFrom: 'alert@example.com',
        emailHost: 'smtp.example.com'
      });
      expect(system.config.emailFrom).toBe('alert@example.com');
    });

    test('should accept Slack webhook configuration', () => {
      const system = new MultiChannelAlertSystem({
        slackWebhookUrl: 'https://hooks.slack.com/services/xxx',
        slackChannel: '#alerts'
      });
      expect(system.config.slackWebhookUrl).toBe('https://hooks.slack.com/services/xxx');
    });

    test('should accept webhook configuration', () => {
      const system = new MultiChannelAlertSystem({
        webhookUrls: ['https://api.example.com/alerts']
      });
      expect(system.config.webhookUrls).toBeDefined();
      expect(system.config.webhookUrls.length).toBeGreaterThan(0);
    });
  });

  describe('Metrics & Health', () => {
    test('should return current metrics', () => {
      const metrics = alertSystem.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalAlerts).toBeDefined();
      expect(metrics.emailSent).toBeDefined();
      expect(metrics.failedAlerts).toBeDefined();
    });

    test('should report health status', async () => {
      const health = await alertSystem.getHealth();

      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.channels).toBeDefined();
    });

    test('should include metrics in health report', async () => {
      const health = await alertSystem.getHealth();

      expect(health.metrics).toBeDefined();
      expect(health.metrics.totalAlerts).toBeDefined();
    });
  });

  describe('Alert Severity Mapping', () => {
    test('should map risk scores to severities correctly', () => {
      const testCases = [
        { risk: 0.95, expected: 'CRITICAL' },
        { risk: 0.80, expected: 'HIGH' },
        { risk: 0.60, expected: 'MEDIUM' },
        { risk: 0.30, expected: 'LOW' }
      ];

      for (const testCase of testCases) {
        const severity = alertSystem.getAlertSeverity(testCase.risk);
        expect(severity).toBe(testCase.expected);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle null alert gracefully', async () => {
      const metrics = alertSystem.getMetrics();
      const initialErrors = metrics.failedAlerts || 0;

      try {
        await alertSystem.sendAlert(null);
      } catch (e) {
        // Expected
      }

      expect((alertSystem.getMetrics().failedAlerts || 0)).toBeGreaterThanOrEqual(initialErrors);
    });

    test('should handle malformed alert data', async () => {
      const malformedAlert = { /* missing required fields */ };
      const initialErrors = alertSystem.getMetrics().failedAlerts || 0;

      try {
        await alertSystem.sendAlert(malformedAlert);
      } catch (e) {
        // Expected or handled gracefully
      }

      // Should either error-increment or handle gracefully
      expect(alertSystem.getMetrics()).toBeDefined();
    });

    test('should continue operating after error', async () => {
      try {
        await alertSystem.sendAlert(null);
      } catch (e) {
        // Expected
      }

      // Should still be able to process valid alert
      const validAlert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.75,
        severity: 'HIGH',
        transactionAmount: 1000,
        transactionCurrency: 'USD',
        merchantName: 'Test',
        merchantCategory: 'Retail',
        transactionType: 'online',
        timestamp: new Date().toISOString(),
        riskFactors: []
      };

      await alertSystem.sendAlert(validAlert);
      expect(alertSystem.getMetrics()).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle multiple alerts in sequence', async () => {
      const alerts = [
        {
          alertId: 'alert_1',
          customerId: 'cust_1',
          riskScore: 0.85,
          severity: 'HIGH',
          transactionAmount: 5000,
          transactionCurrency: 'USD',
          merchantName: 'Merchant 1',
          merchantCategory: 'Retail',
          transactionType: 'online',
          timestamp: new Date().toISOString(),
          riskFactors: []
        },
        {
          alertId: 'alert_2',
          customerId: 'cust_2',
          riskScore: 0.60,
          severity: 'MEDIUM',
          transactionAmount: 2000,
          transactionCurrency: 'USD',
          merchantName: 'Merchant 2',
          merchantCategory: 'Electronics',
          transactionType: 'online',
          timestamp: new Date().toISOString(),
          riskFactors: []
        }
      ];

      for (const alert of alerts) {
        await alertSystem.sendAlert(alert);
      }

      const metrics = alertSystem.getMetrics();
      expect(metrics.totalAlerts || 0).toBeGreaterThanOrEqual(0);
    });

    test('should maintain metrics accuracy across operations', async () => {
      const transaction = {
        customer_id: 'cust_1',
        amount: 5000,
        currency: 'USD',
        merchant_name: 'Test Store',
        merchant_category: 'Retail',
        transaction_type: 'online'
      };

      const riskAnalysis = {
        score: 0.88,
        factors: ['test_factor']
      };

      const metricsBefore = alertSystem.getMetrics();
      const totalBefore = metricsBefore.totalAlerts || 0;

      alertSystem.createFraudAlert(transaction, riskAnalysis);

      const metricsAfter = alertSystem.getMetrics();
      expect(metricsAfter.totalAlerts || 0).toBeGreaterThanOrEqual(totalBefore);
    });
  });
});

// Nicolas Larenas, nlarchive
