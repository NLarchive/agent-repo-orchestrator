/**
 * Automated Response Triggers - Comprehensive Unit Test Suite
 * Tests: Action determination, response execution, notifications, escalations, and rules engine
 */

const AutomatedResponseEngine = require('../engine/response-triggers');

describe('Automated Response Triggers Engine', () => {
  let responseEngine;

  beforeEach(() => {
    responseEngine = new AutomatedResponseEngine({
      enableAutoBlock: true,
      enableAutoLock: true,
      enableAutoNotify: true,
      enableAutoEscalate: true,
      escalationThresholds: {
        high: 0.8,
        medium: 0.6,
        low: 0.4
      },
      lockDuration: 3600000,
      notificationChannels: ['email', 'sms', 'in-app']
    });
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const engine = new AutomatedResponseEngine();
      expect(engine).toBeDefined();
      expect(engine.config).toBeDefined();
    });

    test('should have all features enabled by default', () => {
      expect(responseEngine.config.enableAutoBlock).toBe(true);
      expect(responseEngine.config.enableAutoLock).toBe(true);
      expect(responseEngine.config.enableAutoNotify).toBe(true);
      expect(responseEngine.config.enableAutoEscalate).toBe(true);
    });

    test('should initialize metrics', () => {
      expect(responseEngine.metrics.responseTriggered).toBe(0);
      expect(responseEngine.metrics.accountsBlocked).toBe(0);
      expect(responseEngine.metrics.accountsLocked).toBe(0);
      expect(responseEngine.metrics.notificationsSent).toBe(0);
      expect(responseEngine.metrics.escalationsCreated).toBe(0);
    });

    test('should initialize response tracking structures', () => {
      expect(responseEngine.activeResponses).toBeInstanceOf(Map);
      expect(responseEngine.executionHistory).toEqual([]);
      expect(responseEngine.responseQueue).toEqual([]);
    });

    test('should allow feature toggle configuration', () => {
      const engine = new AutomatedResponseEngine({
        enableAutoBlock: false,
        enableAutoLock: false
      });
      expect(engine.config.enableAutoBlock).toBe(false);
      expect(engine.config.enableAutoLock).toBe(false);
      expect(engine.config.enableAutoNotify).toBe(true);
    });
  });

  describe('Response Triggering', () => {
    test('should trigger response for high-risk alert', async () => {
      const alert = {
        alertId: 'alert_123',
        customerId: 'cust_456',
        riskScore: 0.85,
        type: 'VELOCITY_CHECK'
      };

      const response = await responseEngine.triggerResponse(alert);

      expect(response).toBeDefined();
      expect(response.responseId).toBeDefined();
      expect(response.customerId).toBe('cust_456');
      expect(response.status).toBe('COMPLETED');
      expect(response.actions.length).toBeGreaterThan(0);
    });

    test('should trigger response for medium-risk alert', async () => {
      const alert = {
        alertId: 'alert_124',
        customerId: 'cust_457',
        riskScore: 0.65,
        type: 'AMOUNT_ANOMALY'
      };

      const response = await responseEngine.triggerResponse(alert);

      expect(response.status).toBe('COMPLETED');
      expect(response.actions.length).toBeGreaterThan(0);
    });

    test('should trigger response for low-risk alert', async () => {
      const alert = {
        alertId: 'alert_125',
        customerId: 'cust_458',
        riskScore: 0.35,
        type: 'GEOGRAPHIC_ANOMALY'
      };

      const response = await responseEngine.triggerResponse(alert);

      expect(response.status).toBe('COMPLETED');
      // Low risk may have fewer actions
      expect(response.actions).toBeDefined();
    });

    test('should track response triggering in metrics', async () => {
      const alert = {
        alertId: 'alert_126',
        customerId: 'cust_459',
        riskScore: 0.75
      };

      const triggersBefore = responseEngine.metrics.responseTriggered;
      await responseEngine.triggerResponse(alert);
      const triggersAfter = responseEngine.metrics.responseTriggered;

      expect(triggersAfter).toBeGreaterThan(triggersBefore);
    });

    test('should reject response for invalid alert', async () => {
      const invalidAlert = {
        alertId: 'alert_127'
        // missing customerId and riskScore
      };

      await expect(responseEngine.triggerResponse(invalidAlert)).rejects.toThrow();
    });

    test('should reject response with missing customerId', async () => {
      const alert = {
        alertId: 'alert_128',
        riskScore: 0.75
      };

      await expect(responseEngine.triggerResponse(alert)).rejects.toThrow();
    });

    test('should reject response with missing riskScore', async () => {
      const alert = {
        alertId: 'alert_129',
        customerId: 'cust_460'
      };

      await expect(responseEngine.triggerResponse(alert)).rejects.toThrow();
    });
  });

  describe('Action Determination', () => {
    test('should determine block action for very high risk', () => {
      const alert = {
        alertId: 'alert_130',
        customerId: 'cust_461',
        riskScore: 0.85,
        type: 'FRAUD_DETECTED'
      };

      const actions = responseEngine.determineActions(alert);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some(a => a.type === 'BLOCK_TRANSACTION')).toBe(true);
    });

    test('should determine lock action for extreme risk', () => {
      const alert = {
        alertId: 'alert_131',
        customerId: 'cust_462',
        riskScore: 0.95,
        type: 'FRAUD_DETECTED'
      };

      const actions = responseEngine.determineActions(alert);

      expect(actions.some(a => a.type === 'LOCK_ACCOUNT')).toBe(true);
    });

    test('should determine notify action for medium+ risk', () => {
      const alert = {
        alertId: 'alert_132',
        customerId: 'cust_463',
        riskScore: 0.65,
        type: 'AMOUNT_ANOMALY'
      };

      const actions = responseEngine.determineActions(alert);

      expect(actions.some(a => a.type === 'NOTIFY_CUSTOMER')).toBe(true);
    });

    test('should determine escalation action for high+ risk', () => {
      const alert = {
        alertId: 'alert_133',
        customerId: 'cust_464',
        riskScore: 0.75,
        type: 'VELOCITY_CHECK'
      };

      const actions = responseEngine.determineActions(alert);

      expect(actions.some(a => a.type === 'CREATE_ESCALATION')).toBe(true);
    });

    test('should always log fraud attempt', () => {
      const alert = {
        alertId: 'alert_134',
        customerId: 'cust_465',
        riskScore: 0.25,
        type: 'NORMAL'
      };

      const actions = responseEngine.determineActions(alert);

      expect(actions.some(a => a.type === 'LOG_FRAUD_ATTEMPT')).toBe(true);
    });

    test('should respect feature toggles in action determination', () => {
      const engine = new AutomatedResponseEngine({
        enableAutoBlock: false,
        enableAutoLock: false,
        enableAutoNotify: true
      });

      const alert = {
        alertId: 'alert_135',
        customerId: 'cust_466',
        riskScore: 0.9,
        type: 'FRAUD_DETECTED'
      };

      const actions = engine.determineActions(alert);

      expect(actions.some(a => a.type === 'BLOCK_TRANSACTION')).toBe(false);
      expect(actions.some(a => a.type === 'LOCK_ACCOUNT')).toBe(false);
      expect(actions.some(a => a.type === 'NOTIFY_CUSTOMER')).toBe(true);
    });

    test('should scale actions by risk score levels', () => {
      const lowRiskAlert = {
        alertId: 'alert_136',
        customerId: 'cust_467',
        riskScore: 0.3,
        type: 'NORMAL'
      };

      const highRiskAlert = {
        alertId: 'alert_137',
        customerId: 'cust_468',
        riskScore: 0.95,
        type: 'FRAUD_DETECTED'
      };

      const lowRiskActions = responseEngine.determineActions(lowRiskAlert);
      const highRiskActions = responseEngine.determineActions(highRiskAlert);

      expect(highRiskActions.length).toBeGreaterThan(lowRiskActions.length);
    });
  });

  describe('Action Execution', () => {
    test('should block transaction', async () => {
      const parameters = {
        customerId: 'cust_469',
        duration: 3600000,
        blockType: 'TEMPORARY'
      };

      const result = await responseEngine.blockTransaction(parameters);

      expect(result.actionType).toBe('BLOCK_TRANSACTION');
      expect(result.status).toBe('SUCCESS');
      expect(result.blockId).toBeDefined();
      expect(result.customerId).toBe('cust_469');
    });

    test('should lock account', async () => {
      const parameters = {
        customerId: 'cust_470',
        duration: 3600000,
        lockReason: 'FRAUD_DETECTED'
      };

      const result = await responseEngine.lockAccount(parameters);

      expect(result.actionType).toBe('LOCK_ACCOUNT');
      expect(result.status).toBe('SUCCESS');
      expect(result.lockId).toBeDefined();
      expect(result.lockedAt).toBeDefined();
      expect(result.unlocksAt).toBeDefined();
    });

    test('should notify customer', async () => {
      const parameters = {
        customerId: 'cust_471',
        channels: ['email', 'sms'],
        template: 'fraud_alert_critical',
        data: { riskScore: 0.85, alertType: 'FRAUD_DETECTED' }
      };

      const result = await responseEngine.notifyCustomer(parameters);

      expect(result.actionType).toBe('NOTIFY_CUSTOMER');
      expect(result.status).toBe('SUCCESS');
      expect(result.notificationId).toBeDefined();
      expect(result.channels.length).toBe(2);
    });

    test('should create escalation', async () => {
      const parameters = {
        customerId: 'cust_472',
        escalationLevel: 'MANUAL_REVIEW',
        priority: 1,
        alert: { alertId: 'alert_138' }
      };

      const result = await responseEngine.createEscalation(parameters);

      expect(result.actionType).toBe('CREATE_ESCALATION');
      expect(result.status).toBe('SUCCESS');
      expect(result.escalationId).toBeDefined();
      expect(result.escalationLevel).toBe('MANUAL_REVIEW');
    });

    test('should log fraud attempt', async () => {
      const parameters = {
        customerId: 'cust_473',
        alertId: 'alert_139',
        riskScore: 0.75,
        timestamp: new Date()
      };

      const result = await responseEngine.logFraudAttempt(parameters);

      expect(result.actionType).toBe('LOG_FRAUD_ATTEMPT');
      expect(result.status).toBe('SUCCESS');
      expect(result.logId).toBeDefined();
    });

    test('should track metrics for executed actions', async () => {
      const alert = {
        alertId: 'alert_140',
        customerId: 'cust_474',
        riskScore: 0.85
      };

      const responsesExecutedBefore = responseEngine.metrics.responsesExecuted;

      await responseEngine.triggerResponse(alert);

      expect(responseEngine.metrics.responsesExecuted).toBeGreaterThan(responsesExecutedBefore);
      expect(responseEngine.metrics.responseTriggered).toBeGreaterThan(0);
    });
  });

  describe('Response Management', () => {
    test('should get active responses', async () => {
      const alert = {
        alertId: 'alert_141',
        customerId: 'cust_475',
        riskScore: 0.75
      };

      await responseEngine.triggerResponse(alert);

      const activeResponses = responseEngine.getActiveResponses();
      expect(activeResponses).toBeDefined();
      expect(Array.isArray(activeResponses)).toBe(true);
    });

    test('should get response history', async () => {
      const alert1 = {
        alertId: 'alert_142',
        customerId: 'cust_476',
        riskScore: 0.75
      };

      const alert2 = {
        alertId: 'alert_143',
        customerId: 'cust_477',
        riskScore: 0.65
      };

      await responseEngine.triggerResponse(alert1);
      await responseEngine.triggerResponse(alert2);

      const history = responseEngine.getResponseHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    test('should get response status', async () => {
      const alert = {
        alertId: 'alert_144',
        customerId: 'cust_478',
        riskScore: 0.75
      };

      const response = await responseEngine.triggerResponse(alert);
      const status = responseEngine.getResponseStatus(response.responseId);

      expect(status).toBeDefined();
      expect(status.status).toBe('COMPLETED');
    });

    test('should cancel pending response', async () => {
      const alert = {
        alertId: 'alert_145',
        customerId: 'cust_479',
        riskScore: 0.75
      };

      const response = await responseEngine.triggerResponse(alert);
      response.status = 'PENDING'; // Simulate pending status

      const cancelled = await responseEngine.cancelResponse(response.responseId);

      expect(cancelled.status).toBe('CANCELLED');
    });

    test('should not cancel completed response', async () => {
      const alert = {
        alertId: 'alert_146',
        customerId: 'cust_480',
        riskScore: 0.75
      };

      const response = await responseEngine.triggerResponse(alert);

      await expect(responseEngine.cancelResponse(response.responseId)).rejects.toThrow();
    });
  });

  describe('Metrics & Health', () => {
    test('should return current metrics', () => {
      const metrics = responseEngine.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.responseTriggered).toBeGreaterThanOrEqual(0);
      expect(metrics.responsesExecuted).toBeGreaterThanOrEqual(0);
      expect(metrics.timestamp).toBeDefined();
    });

    test('should report healthy status', async () => {
      const alert = {
        alertId: 'alert_147',
        customerId: 'cust_481',
        riskScore: 0.75
      };

      await responseEngine.triggerResponse(alert);

      const health = await responseEngine.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.responseEngineEnabled).toBe(true);
    });

    test('should include feature flags in health report', async () => {
      const health = await responseEngine.getHealth();

      expect(health.autoBlockEnabled).toBe(true);
      expect(health.autoLockEnabled).toBe(true);
      expect(health.autoNotifyEnabled).toBe(true);
      expect(health.autoEscalateEnabled).toBe(true);
    });

    test('should include metrics in health report', async () => {
      const alert = {
        alertId: 'alert_148',
        customerId: 'cust_482',
        riskScore: 0.75
      };

      await responseEngine.triggerResponse(alert);

      const health = await responseEngine.getHealth();

      expect(health.metrics).toBeDefined();
      expect(health.metrics.responseTriggered).toBeGreaterThan(0);
      // averageResponseTime is stored as string in metrics output
      expect(health.metrics.averageResponseTime).toBeDefined();
    });

    test('should calculate error rate', async () => {
      const alert = {
        alertId: 'alert_149',
        customerId: 'cust_483',
        riskScore: 0.75
      };

      await responseEngine.triggerResponse(alert);

      const health = await responseEngine.getHealth();
      const errorRate = parseFloat(health.metrics.errorRate);

      expect(errorRate).toBeGreaterThanOrEqual(0);
      expect(errorRate).toBeLessThanOrEqual(1);
    });
  });

  describe('History Management', () => {
    test('should clear old history', async () => {
      const alert = {
        alertId: 'alert_150',
        customerId: 'cust_484',
        riskScore: 0.75
      };

      await responseEngine.triggerResponse(alert);

      const result = responseEngine.clearOldHistory(0); // Clear all

      expect(result.removed).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    test('should limit history retrieval', async () => {
      const alert = {
        alertId: 'alert_151',
        customerId: 'cust_485',
        riskScore: 0.75
      };

      for (let i = 0; i < 5; i++) {
        alert.alertId = `alert_${151 + i}`;
        await responseEngine.triggerResponse(alert);
      }

      const history = responseEngine.getResponseHistory(3);

      expect(history.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Action Templates & Rules', () => {
    test('should provide action templates', () => {
      const templates = responseEngine.getActionTemplates();

      expect(templates.blockTransaction).toBeDefined();
      expect(templates.lockAccount).toBeDefined();
      expect(templates.notifyCustomer).toBeDefined();
      expect(templates.createEscalation).toBeDefined();
      expect(templates.logFraudAttempt).toBeDefined();
    });

    test('should add custom rule', () => {
      const rule = {
        name: 'Custom Block Rule',
        condition: (alert) => alert.riskScore > 0.9,
        actions: [
          { type: 'BLOCK_TRANSACTION', duration: 3600000 }
        ]
      };

      const result = responseEngine.addCustomRule(rule);

      expect(result.ruleId).toBeDefined();
      expect(result.name).toBe('Custom Block Rule');
      expect(result.createdAt).toBeDefined();
    });

    test('should reject invalid custom rule', () => {
      const invalidRule = {
        name: 'Invalid Rule'
        // missing condition and actions
      };

      expect(() => responseEngine.addCustomRule(invalidRule)).toThrow();
    });
  });

  describe('Configuration', () => {
    test('should use custom escalation thresholds', () => {
      const engine = new AutomatedResponseEngine({
        escalationThresholds: {
          high: 0.9,
          medium: 0.7,
          low: 0.5
        }
      });

      expect(engine.config.escalationThresholds.high).toBe(0.9);
      expect(engine.config.escalationThresholds.medium).toBe(0.7);
      expect(engine.config.escalationThresholds.low).toBe(0.5);
    });

    test('should use custom lock duration', () => {
      const engine = new AutomatedResponseEngine({
        lockDuration: 7200000
      });

      expect(engine.config.lockDuration).toBe(7200000);
    });

    test('should use custom notification channels', () => {
      const engine = new AutomatedResponseEngine({
        notificationChannels: ['email', 'webhook']
      });

      expect(engine.config.notificationChannels.length).toBe(2);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle high-risk alert with all actions', async () => {
      const alert = {
        alertId: 'alert_152',
        customerId: 'cust_486',
        riskScore: 0.9,
        type: 'FRAUD_DETECTED'
      };

      const response = await responseEngine.triggerResponse(alert);

      expect(response.actions.length).toBeGreaterThan(0);
      expect(response.results.length).toBe(response.actions.length);
      expect(response.results.every(r => r.status === 'SUCCESS')).toBe(true);
    });

    test('should measure response execution time', async () => {
      const alert = {
        alertId: 'alert_153',
        customerId: 'cust_487',
        riskScore: 0.75
      };

      const response = await responseEngine.triggerResponse(alert);

      expect(response.executionTime).toBeGreaterThanOrEqual(0);
      expect(response.executedAt).toBeDefined();
    });

    test('should maintain response audit trail', async () => {
      const alert1 = {
        alertId: 'alert_154',
        customerId: 'cust_488',
        riskScore: 0.8
      };

      const alert2 = {
        alertId: 'alert_155',
        customerId: 'cust_489',
        riskScore: 0.6
      };

      const response1 = await responseEngine.triggerResponse(alert1);
      const response2 = await responseEngine.triggerResponse(alert2);

      const history = responseEngine.getResponseHistory();

      expect(history.some(h => h.responseId === response1.responseId)).toBe(true);
      expect(history.some(h => h.responseId === response2.responseId)).toBe(true);
    });

    test('should handle rapid sequential responses', async () => {
      const alerts = Array.from({ length: 10 }, (_, i) => ({
        alertId: `alert_${156 + i}`,
        customerId: `cust_${490 + i}`,
        riskScore: 0.5 + (Math.random() * 0.4)
      }));

      const responses = await Promise.all(
        alerts.map(alert => responseEngine.triggerResponse(alert))
      );

      expect(responses.length).toBe(10);
      expect(responses.every(r => r.status === 'COMPLETED')).toBe(true);
      expect(responseEngine.metrics.responseTriggered).toBeGreaterThanOrEqual(10);
    });

    test('should provide complete response lifecycle', async () => {
      const alert = {
        alertId: 'alert_166',
        customerId: 'cust_500',
        riskScore: 0.75
      };

      // Trigger response
      const response = await responseEngine.triggerResponse(alert);
      expect(response.status).toBe('COMPLETED');

      // Get status
      const status = responseEngine.getResponseStatus(response.responseId);
      expect(status).toBeDefined();

      // Get metrics
      const metrics = responseEngine.getMetrics();
      expect(metrics.responsesExecuted).toBeGreaterThan(0);

      // Get health
      const health = await responseEngine.getHealth();
      expect(health.status).toBe('healthy');
    });
  });
});

// Nicolas Larenas, nlarchive
