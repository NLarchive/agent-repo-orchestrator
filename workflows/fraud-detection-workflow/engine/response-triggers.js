#!/usr/bin/env node
/**
 * Automated Response Triggers Engine
 * Executes automated responses to detected fraud: account locking, transaction blocking,
 * customer notifications, and escalation workflows
 */

const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

let logger = null;

class AutomatedResponseEngine {
  constructor(config = {}) {
    // Initialize logger
    if (!logger) {
      logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'response-triggers' },
        transports: [
          new winston.transports.Console()
        ]
      });
    }

    this.config = {
      enableAutoBlock: config.enableAutoBlock !== false,
      enableAutoLock: config.enableAutoLock !== false,
      enableAutoNotify: config.enableAutoNotify !== false,
      enableAutoEscalate: config.enableAutoEscalate !== false,
      escalationThresholds: config.escalationThresholds || {
        high: 0.8,
        medium: 0.6,
        low: 0.4
      },
      lockDuration: config.lockDuration || 3600000, // 1 hour
      notificationChannels: config.notificationChannels || ['email', 'sms', 'in-app'],
      escalationLevels: config.escalationLevels || [
        'AUTO_BLOCK',
        'ACCOUNT_LOCK',
        'MANUAL_REVIEW',
        'ESCALATE_SECURITY'
      ],
      ...config
    };

    this.metrics = {
      responseTriggered: 0,
      accountsBlocked: 0,
      accountsLocked: 0,
      notificationsSent: 0,
      escalationsCreated: 0,
      responsesExecuted: 0,
      responsesFailed: 0,
      averageResponseTime: 0,
      errors: 0,
      timestamp: new Date()
    };

    this.responseQueue = [];
    this.executionHistory = [];
    this.activeResponses = new Map();
  }

  /**
   * Trigger automated response based on fraud alert
   */
  async triggerResponse(alert) {
    try {
      if (!alert || !alert.customerId || !alert.riskScore) {
        throw new Error('Invalid alert: missing customerId or riskScore');
      }

      this.metrics.responseTriggered++;

      const responseId = uuidv4();
      const startTime = Date.now();

      // Determine response actions based on risk score
      const actions = this.determineActions(alert);

      const response = {
        responseId,
        customerId: alert.customerId,
        alertId: alert.alertId,
        riskScore: alert.riskScore,
        actions,
        status: 'PENDING',
        createdAt: new Date(),
        executedAt: null,
        executionTime: 0,
        results: []
      };

      this.activeResponses.set(responseId, response);

      // Execute response actions
      const results = await this.executeActions(alert, actions);
      response.results = results;
      response.status = 'COMPLETED';
      response.executedAt = new Date();
      response.executionTime = Date.now() - startTime;

      // Update metrics
      this.metrics.responsesExecuted++;
      this.updateAverageResponseTime(response.executionTime);

      // Track in history
      this.executionHistory.push({
        responseId,
        customerId: alert.customerId,
        riskScore: alert.riskScore,
        actionsExecuted: actions.length,
        executionTime: response.executionTime,
        status: 'SUCCESS',
        timestamp: new Date()
      });

      logger.info('Response triggered successfully', {
        responseId,
        customerId: alert.customerId,
        riskScore: alert.riskScore,
        actionsCount: actions.length
      });

      return response;
    } catch (error) {
      logger.error('Failed to trigger response', { error: error.message, alertId: alert?.alertId });
      this.metrics.errors++;
      this.metrics.responsesFailed++;
      throw error;
    }
  }

  /**
   * Determine response actions based on risk score and alert type
   */
  determineActions(alert) {
    const actions = [];
    const riskScore = alert.riskScore;

    // Auto-block transactions for very high risk
    if (riskScore >= this.config.escalationThresholds.high && this.config.enableAutoBlock) {
      actions.push({
        type: 'BLOCK_TRANSACTION',
        priority: 'CRITICAL',
        reason: 'High fraud risk detected',
        parameters: {
          customerId: alert.customerId,
          duration: 3600000, // 1 hour
          blockType: 'TEMPORARY'
        }
      });
    }

    // Lock account for extreme risk
    if (riskScore >= 0.9 && this.config.enableAutoLock) {
      actions.push({
        type: 'LOCK_ACCOUNT',
        priority: 'CRITICAL',
        reason: 'Extreme fraud risk - account locked for security',
        parameters: {
          customerId: alert.customerId,
          duration: this.config.lockDuration,
          lockReason: 'FRAUD_DETECTED'
        }
      });
    }

    // Notify customer for high risk
    if (riskScore >= this.config.escalationThresholds.medium && this.config.enableAutoNotify) {
      actions.push({
        type: 'NOTIFY_CUSTOMER',
        priority: 'HIGH',
        reason: 'Customer notification of suspicious activity',
        parameters: {
          customerId: alert.customerId,
          channels: this.config.notificationChannels,
          template: riskScore >= this.config.escalationThresholds.high ? 'fraud_alert_critical' : 'fraud_alert_medium',
          data: {
            riskScore: riskScore.toFixed(2),
            alertType: alert.type
          }
        }
      });
    }

    // Escalate for manual review
    if (riskScore >= this.config.escalationThresholds.medium && this.config.enableAutoEscalate) {
      actions.push({
        type: 'CREATE_ESCALATION',
        priority: riskScore >= this.config.escalationThresholds.high ? 'CRITICAL' : 'HIGH',
        reason: 'Escalation for manual review',
        parameters: {
          customerId: alert.customerId,
          escalationLevel: riskScore >= this.config.escalationThresholds.high ? 'MANUAL_REVIEW' : 'QUEUE_REVIEW',
          priority: riskScore >= this.config.escalationThresholds.high ? 1 : 2,
          alert: alert
        }
      });
    }

    // Log fraud attempt for audit
    actions.push({
      type: 'LOG_FRAUD_ATTEMPT',
      priority: 'HIGH',
      reason: 'Audit trail logging',
      parameters: {
        customerId: alert.customerId,
        alertId: alert.alertId,
        riskScore: riskScore,
        timestamp: new Date()
      }
    });

    return actions;
  }

  /**
   * Execute response actions
   */
  async executeActions(alert, actions) {
    const results = [];

    for (const action of actions) {
      try {
        const result = await this.executeAction(action);
        results.push(result);

        // Update metrics based on action type
        if (action.type === 'BLOCK_TRANSACTION') {
          this.metrics.accountsBlocked++;
        } else if (action.type === 'LOCK_ACCOUNT') {
          this.metrics.accountsLocked++;
        } else if (action.type === 'NOTIFY_CUSTOMER') {
          this.metrics.notificationsSent++;
        } else if (action.type === 'CREATE_ESCALATION') {
          this.metrics.escalationsCreated++;
        }
      } catch (error) {
        logger.error('Action execution failed', {
          actionType: action.type,
          customerId: alert.customerId,
          error: error.message
        });

        results.push({
          actionType: action.type,
          status: 'FAILED',
          error: error.message,
          executedAt: new Date()
        });
      }
    }

    return results;
  }

  /**
   * Execute individual action
   */
  async executeAction(action) {
    const startTime = Date.now();

    switch (action.type) {
      case 'BLOCK_TRANSACTION':
        return await this.blockTransaction(action.parameters);

      case 'LOCK_ACCOUNT':
        return await this.lockAccount(action.parameters);

      case 'NOTIFY_CUSTOMER':
        return await this.notifyCustomer(action.parameters);

      case 'CREATE_ESCALATION':
        return await this.createEscalation(action.parameters);

      case 'LOG_FRAUD_ATTEMPT':
        return await this.logFraudAttempt(action.parameters);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Block transaction
   */
  async blockTransaction(parameters) {
    const { customerId, duration, blockType } = parameters;

    // Simulate transaction blocking
    const blockId = uuidv4();

    logger.info('Transaction blocked', {
      blockId,
      customerId,
      duration,
      blockType
    });

    return {
      actionType: 'BLOCK_TRANSACTION',
      status: 'SUCCESS',
      blockId,
      customerId,
      duration,
      blockType,
      executedAt: new Date()
    };
  }

  /**
   * Lock account
   */
  async lockAccount(parameters) {
    const { customerId, duration, lockReason } = parameters;

    // Simulate account locking
    const lockId = uuidv4();

    logger.info('Account locked', {
      lockId,
      customerId,
      duration,
      lockReason
    });

    return {
      actionType: 'LOCK_ACCOUNT',
      status: 'SUCCESS',
      lockId,
      customerId,
      duration,
      lockReason,
      lockedAt: new Date(),
      unlocksAt: new Date(Date.now() + duration)
    };
  }

  /**
   * Notify customer
   */
  async notifyCustomer(parameters) {
    const { customerId, channels, template, data } = parameters;

    // Simulate customer notification
    const notificationId = uuidv4();
    const sentChannels = [];

    for (const channel of channels) {
      // Simulate sending notification through each channel
      sentChannels.push({
        channel,
        status: 'SENT',
        deliveredAt: new Date()
      });
    }

    logger.info('Customer notified', {
      notificationId,
      customerId,
      channels: sentChannels.map(c => c.channel),
      template
    });

    return {
      actionType: 'NOTIFY_CUSTOMER',
      status: 'SUCCESS',
      notificationId,
      customerId,
      channels: sentChannels,
      template,
      sentAt: new Date()
    };
  }

  /**
   * Create escalation for manual review
   */
  async createEscalation(parameters) {
    const { customerId, escalationLevel, priority, alert } = parameters;

    // Simulate creating escalation ticket
    const escalationId = uuidv4();

    logger.info('Escalation created', {
      escalationId,
      customerId,
      escalationLevel,
      priority
    });

    return {
      actionType: 'CREATE_ESCALATION',
      status: 'SUCCESS',
      escalationId,
      customerId,
      escalationLevel,
      priority,
      alertId: alert.alertId,
      createdAt: new Date()
    };
  }

  /**
   * Log fraud attempt for audit trail
   */
  async logFraudAttempt(parameters) {
    const { customerId, alertId, riskScore, timestamp } = parameters;

    // Simulate audit logging
    const logId = uuidv4();

    logger.info('Fraud attempt logged', {
      logId,
      customerId,
      alertId,
      riskScore
    });

    return {
      actionType: 'LOG_FRAUD_ATTEMPT',
      status: 'SUCCESS',
      logId,
      customerId,
      alertId,
      riskScore,
      timestamp
    };
  }

  /**
   * Get active responses
   */
  getActiveResponses() {
    const active = [];
    for (const [responseId, response] of this.activeResponses) {
      if (response.status === 'PENDING') {
        active.push(response);
      }
    }
    return active;
  }

  /**
   * Get response history
   */
  getResponseHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get response status
   */
  getResponseStatus(responseId) {
    return this.activeResponses.get(responseId) || null;
  }

  /**
   * Cancel response
   */
  async cancelResponse(responseId) {
    const response = this.activeResponses.get(responseId);
    if (!response) {
      throw new Error(`Response not found: ${responseId}`);
    }

    if (response.status === 'COMPLETED') {
      throw new Error('Cannot cancel completed response');
    }

    response.status = 'CANCELLED';
    logger.info('Response cancelled', { responseId });

    return response;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeResponses: this.activeResponses.size,
      executionHistorySize: this.executionHistory.length,
      timestamp: new Date()
    };
  }

  /**
   * Get health status
   */
  async getHealth() {
    const metrics = this.getMetrics();
    const errorRate = metrics.responsesExecuted > 0 
      ? (metrics.responsesFailed / metrics.responsesExecuted) 
      : 0;

    return {
      status: errorRate > 0.1 ? 'degraded' : 'healthy',
      responseEngineEnabled: true,
      autoBlockEnabled: this.config.enableAutoBlock,
      autoLockEnabled: this.config.enableAutoLock,
      autoNotifyEnabled: this.config.enableAutoNotify,
      autoEscalateEnabled: this.config.enableAutoEscalate,
      metrics: {
        responseTriggered: metrics.responseTriggered,
        responsesExecuted: metrics.responsesExecuted,
        responsesFailed: metrics.responsesFailed,
        errorRate: errorRate.toFixed(4),
        averageResponseTime: metrics.averageResponseTime.toFixed(2)
      },
      activeResponses: metrics.activeResponses,
      timestamp: new Date()
    };
  }

  /**
   * Update average response time
   */
  updateAverageResponseTime(newTime) {
    const executed = this.metrics.responsesExecuted;
    const current = this.metrics.averageResponseTime;
    this.metrics.averageResponseTime = (current * (executed - 1) + newTime) / executed;
  }

  /**
   * Clear old history
   */
  clearOldHistory(olderThanHours = 24) {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    const beforeCount = this.executionHistory.length;

    this.executionHistory = this.executionHistory.filter(
      entry => new Date(entry.timestamp).getTime() > cutoffTime
    );

    const removed = beforeCount - this.executionHistory.length;
    logger.info('Old history cleared', { removed, remaining: this.executionHistory.length });

    return { removed, remaining: this.executionHistory.length };
  }

  /**
   * Get action template for rule engine
   */
  getActionTemplates() {
    return {
      blockTransaction: {
        type: 'BLOCK_TRANSACTION',
        description: 'Block customer transactions temporarily',
        parameters: {
          customerId: 'string',
          duration: 'number (milliseconds)',
          blockType: 'string (TEMPORARY|PERMANENT)'
        }
      },
      lockAccount: {
        type: 'LOCK_ACCOUNT',
        description: 'Lock customer account',
        parameters: {
          customerId: 'string',
          duration: 'number (milliseconds)',
          lockReason: 'string'
        }
      },
      notifyCustomer: {
        type: 'NOTIFY_CUSTOMER',
        description: 'Send customer notification',
        parameters: {
          customerId: 'string',
          channels: 'array (email, sms, in-app)',
          template: 'string',
          data: 'object'
        }
      },
      createEscalation: {
        type: 'CREATE_ESCALATION',
        description: 'Create escalation for manual review',
        parameters: {
          customerId: 'string',
          escalationLevel: 'string (QUEUE_REVIEW|MANUAL_REVIEW|ESCALATE_SECURITY)',
          priority: 'number (1-5)'
        }
      },
      logFraudAttempt: {
        type: 'LOG_FRAUD_ATTEMPT',
        description: 'Log fraud attempt for audit trail',
        parameters: {
          customerId: 'string',
          alertId: 'string',
          riskScore: 'number (0-1)',
          timestamp: 'date'
        }
      }
    };
  }

  /**
   * Create custom rule
   */
  addCustomRule(rule) {
    if (!rule.name || !rule.condition || !rule.actions) {
      throw new Error('Invalid rule: missing name, condition, or actions');
    }

    // Validate rule structure
    if (typeof rule.condition !== 'function') {
      throw new Error('Rule condition must be a function');
    }

    if (!Array.isArray(rule.actions)) {
      throw new Error('Rule actions must be an array');
    }

    logger.info('Custom rule added', { ruleName: rule.name });

    return {
      ruleId: uuidv4(),
      name: rule.name,
      createdAt: new Date()
    };
  }
}

module.exports = AutomatedResponseEngine;

// Nicolas Larenas, nlarchive
