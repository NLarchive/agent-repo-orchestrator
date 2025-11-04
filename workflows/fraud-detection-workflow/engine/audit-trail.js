#!/usr/bin/env node
/**
 * Comprehensive Audit Trail System
 * Immutable logging of all fraud decisions, system actions, and compliance events
 */

const postgres = require('postgres');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const winston = require('winston');

// Initialize logger
let logger = null;

class AuditTrailSystem {
  constructor(config = {}) {
    // Initialize logger
    if (!logger) {
      logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'audit-trail' },
        transports: [
          new winston.transports.Console()
        ]
      });
    }

    this.config = {
      postgresUrl: config.postgresUrl || process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/orchestrator',
      enableEncryption: config.enableEncryption !== false,
      encryptionKey: config.encryptionKey || process.env.AUDIT_ENCRYPTION_KEY || 'default-key-change-in-production',
      retentionDays: config.retentionDays || 2555, // 7 years for PCI DSS
      hashAlgorithm: config.hashAlgorithm || 'sha256',
      ...config
    };

    this.db = null;
    this.metrics = {
      eventsLogged: 0,
      decisionsLogged: 0,
      complianceEventsLogged: 0,
      totalBytes: 0,
      lastLoggedAt: null,
      errors: 0
    };
  }

  /**
   * Connect to database
   */
  async connect() {
    try {
      this.db = postgres(this.config.postgresUrl);
      await this.db`SELECT 1`;
      logger.info('Connected to audit trail database');
      await this.initializeSchema();
    } catch (error) {
      logger.error('Failed to connect to audit database', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize audit trail schema
   */
  async initializeSchema() {
    try {
      // Audit events table - immutable log
      await this.db`
        CREATE TABLE IF NOT EXISTS audit_events (
          id UUID PRIMARY KEY,
          event_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20),
          actor_type VARCHAR(50),
          actor_id VARCHAR(255),
          resource_type VARCHAR(100),
          resource_id UUID,
          action VARCHAR(100),
          status VARCHAR(20),
          details JSONB,
          event_hash VARCHAR(64),
          previous_hash VARCHAR(64),
          timestamp TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (created_at >= '2023-01-01')
        )
      `;

      // Fraud decisions table
      await this.db`
        CREATE TABLE IF NOT EXISTS fraud_decisions (
          id UUID PRIMARY KEY,
          transaction_id UUID NOT NULL,
          customer_id UUID NOT NULL,
          risk_score DECIMAL(3, 2),
          decision VARCHAR(50),
          recommendation VARCHAR(100),
          factors JSONB,
          model_version VARCHAR(50),
          decision_timestamp TIMESTAMP NOT NULL,
          decision_maker VARCHAR(255),
          reviewed_by VARCHAR(255),
          review_timestamp TIMESTAMP,
          appeal_status VARCHAR(50),
          appeal_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (transaction_id) REFERENCES transactions(id)
        )
      `;

      // Compliance events table
      await this.db`
        CREATE TABLE IF NOT EXISTS compliance_events (
          id UUID PRIMARY KEY,
          compliance_type VARCHAR(50),
          regulation VARCHAR(100),
          entity_type VARCHAR(50),
          entity_id VARCHAR(255),
          event_type VARCHAR(100),
          status VARCHAR(20),
          evidence JSONB,
          remediation_status VARCHAR(50),
          resolved_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      // Create indexes
      await this.db`CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp)`;
      await this.db`CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_type, actor_id)`;
      await this.db`CREATE INDEX IF NOT EXISTS idx_fraud_decisions_customer ON fraud_decisions(customer_id)`;
      await this.db`CREATE INDEX IF NOT EXISTS idx_fraud_decisions_timestamp ON fraud_decisions(decision_timestamp)`;
      await this.db`CREATE INDEX IF NOT EXISTS idx_compliance_events_type ON compliance_events(compliance_type)`;

      logger.info('Audit trail schema initialized');
    } catch (error) {
      logger.error('Failed to initialize audit schema', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate event hash for immutability
   */
  calculateHash(event, previousHash) {
    const hash = crypto.createHash(this.config.hashAlgorithm);
    hash.update(JSON.stringify({
      event,
      previousHash,
      timestamp: event.timestamp
    }));
    return hash.digest('hex');
  }

  /**
   * Encrypt sensitive data if enabled
   */
  encryptData(data) {
    if (!this.config.enableEncryption) {
      return data;
    }

    try {
      const cipher = crypto.createCipher('aes-256-cbc', this.config.encryptionKey);
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return `ENC:${encrypted}`;
    } catch (error) {
      logger.error('Encryption failed, storing plaintext', { error: error.message });
      return data;
    }
  }

  /**
   * Decrypt sensitive data if enabled
   */
  decryptData(encrypted) {
    if (!encrypted || !encrypted.startsWith('ENC:')) {
      return encrypted;
    }

    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.config.encryptionKey);
      let decrypted = decipher.update(encrypted.substring(4), 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      return null;
    }
  }

  /**
   * Log audit event
   */
  async logEvent(event) {
    try {
      const eventId = event.id || uuidv4();
      const timestamp = event.timestamp || new Date();

      // Get previous hash for chain integrity
      const lastEvent = await this.db`
        SELECT event_hash FROM audit_events 
        ORDER BY timestamp DESC LIMIT 1
      `;
      const previousHash = lastEvent && lastEvent[0] ? lastEvent[0].event_hash : null;

      // Calculate new hash
      const eventHash = this.calculateHash(event, previousHash);

      // Encrypt sensitive details
      const encryptedDetails = this.encryptData(event.details);

      // Log event
      await this.db`
        INSERT INTO audit_events 
        (id, event_type, severity, actor_type, actor_id, resource_type, 
         resource_id, action, status, details, event_hash, previous_hash, timestamp)
        VALUES 
        (${eventId}, ${event.type}, ${event.severity || 'INFO'}, 
         ${event.actor?.type}, ${event.actor?.id}, ${event.resource?.type},
         ${event.resource?.id}, ${event.action}, ${event.status || 'SUCCESS'},
         ${JSON.stringify(encryptedDetails)}, ${eventHash}, ${previousHash}, ${timestamp})
      `;

      this.metrics.eventsLogged++;
      this.metrics.lastLoggedAt = new Date();

      logger.info('Audit event logged', {
        eventId,
        type: event.type,
        actor: event.actor?.id
      });

      return eventId;
    } catch (error) {
      logger.error('Failed to log audit event', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Log fraud decision
   */
  async logFraudDecision(decision) {
    try {
      const decisionId = uuidv4();

      await this.db`
        INSERT INTO fraud_decisions
        (id, transaction_id, customer_id, risk_score, decision, recommendation, 
         factors, model_version, decision_timestamp, decision_maker)
        VALUES
        (${decisionId}, ${decision.transactionId}, ${decision.customerId},
         ${decision.riskScore}, ${decision.decision}, ${decision.recommendation},
         ${JSON.stringify(decision.factors)}, ${decision.modelVersion},
         ${new Date()}, ${decision.decisionMaker || 'SYSTEM'})
      `;

      // Also log as audit event
      await this.logEvent({
        type: 'FRAUD_DECISION',
        severity: decision.riskScore > 0.8 ? 'CRITICAL' : decision.riskScore > 0.5 ? 'HIGH' : 'MEDIUM',
        action: 'FRAUD_ASSESSMENT',
        status: decision.decision,
        resource: { type: 'FRAUD_DECISION', id: decisionId },
        actor: { type: 'SYSTEM', id: 'FRAUD_ENGINE' },
        details: decision
      });

      this.metrics.decisionsLogged++;
      logger.info('Fraud decision logged', { decisionId, decision: decision.decision });

      return decisionId;
    } catch (error) {
      logger.error('Failed to log fraud decision', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Log compliance event
   */
  async logComplianceEvent(event) {
    try {
      const eventId = uuidv4();

      await this.db`
        INSERT INTO compliance_events
        (id, compliance_type, regulation, entity_type, entity_id, 
         event_type, status, evidence)
        VALUES
        (${eventId}, ${event.complianceType}, ${event.regulation},
         ${event.entityType}, ${event.entityId},
         ${event.eventType}, ${event.status || 'REPORTED'},
         ${JSON.stringify(event.evidence)})
      `;

      // Also log as audit event
      await this.logEvent({
        type: 'COMPLIANCE_EVENT',
        severity: 'HIGH',
        action: event.eventType,
        status: event.status,
        resource: { type: 'COMPLIANCE', id: eventId },
        actor: { type: 'SYSTEM', id: 'COMPLIANCE_ENGINE' },
        details: event
      });

      this.metrics.complianceEventsLogged++;
      logger.info('Compliance event logged', { eventId, type: event.complianceType });

      return eventId;
    } catch (error) {
      logger.error('Failed to log compliance event', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Verify audit chain integrity
   */
  async verifyChainIntegrity() {
    try {
      const events = await this.db`
        SELECT id, event_hash, previous_hash, timestamp
        FROM audit_events
        ORDER BY timestamp ASC
      `;

      let isValid = true;
      let previousHash = null;

      for (const event of events) {
        if (event.previous_hash !== previousHash) {
          logger.error('Chain integrity violation detected', {
            eventId: event.id,
            expectedPrevious: previousHash,
            actualPrevious: event.previous_hash
          });
          isValid = false;
        }
        previousHash = event.event_hash;
      }

      if (isValid) {
        logger.info('Audit chain integrity verified', { eventCount: events.length });
      }

      return {
        isValid,
        eventCount: events.length,
        lastHash: previousHash
      };
    } catch (error) {
      logger.error('Failed to verify chain integrity', { error: error.message });
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate, endDate, complianceType = null) {
    try {
      let query = this.db`
        SELECT 
          compliance_type,
          regulation,
          COUNT(*) as event_count,
          COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved,
          COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending
        FROM compliance_events
        WHERE created_at >= ${startDate} AND created_at <= ${endDate}
      `;

      if (complianceType) {
        query = query`AND compliance_type = ${complianceType}`;
      }

      const report = await query`GROUP BY compliance_type, regulation`;

      logger.info('Compliance report generated', { periodDays: (endDate - startDate) / (1000 * 60 * 60 * 24) });

      return {
        reportDate: new Date(),
        periodStart: startDate,
        periodEnd: endDate,
        summary: report,
        metrics: this.getMetrics()
      };
    } catch (error) {
      logger.error('Failed to generate compliance report', { error: error.message });
      throw error;
    }
  }

  /**
   * Query audit events with search
   */
  async queryAuditEvents(filters = {}) {
    try {
      let query = this.db`SELECT * FROM audit_events WHERE 1=1`;

      if (filters.eventType) {
        query = query`AND event_type = ${filters.eventType}`;
      }
      if (filters.actorId) {
        query = query`AND actor_id = ${filters.actorId}`;
      }
      if (filters.startDate) {
        query = query`AND timestamp >= ${filters.startDate}`;
      }
      if (filters.endDate) {
        query = query`AND timestamp <= ${filters.endDate}`;
      }

      const events = await query`ORDER BY timestamp DESC LIMIT ${filters.limit || 100}`;

      return events;
    } catch (error) {
      logger.error('Failed to query audit events', { error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup old events (respecting retention policy)
   */
  async cleanupOldEvents() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const result = await this.db`
        DELETE FROM audit_events
        WHERE timestamp < ${cutoffDate}
        RETURNING id
      `;

      logger.info('Old audit events cleaned up', { deletedCount: result.length, beforeDate: cutoffDate });

      return { deletedCount: result.length };
    } catch (error) {
      logger.error('Failed to cleanup old events', { error: error.message });
      throw error;
    }
  }

  /**
   * Get audit metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get health status
   */
  async getHealth() {
    try {
      const dbHealthy = await this.db`SELECT 1` ? true : false;
      const integrity = await this.verifyChainIntegrity();

      return {
        status: dbHealthy && integrity.isValid ? 'healthy' : 'degraded',
        database: dbHealthy,
        chainIntegrity: integrity.isValid,
        metrics: this.getMetrics()
      };
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Close connection
   */
  async close() {
    if (this.db) {
      await this.db.end();
      logger.info('Audit trail database connection closed');
    }
  }
}

module.exports = AuditTrailSystem;

// Start if run directly
if (require.main === module) {
  const auditSystem = new AuditTrailSystem();
  
  console.log('✓ Audit Trail System initialized');
  console.log('✓ Configuration:', {
    encryption: auditSystem.config.enableEncryption,
    retentionDays: auditSystem.config.retentionDays,
    hashAlgorithm: auditSystem.config.hashAlgorithm
  });
  console.log('✓ Metrics:', auditSystem.getMetrics());
}

// Nicolas Larenas, nlarchive
