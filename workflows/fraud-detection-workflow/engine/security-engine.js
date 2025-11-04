#!/usr/bin/env node
/**
 * Security Hardening & Encryption Module
 * End-to-end encryption, API authentication, secrets management, and security controls
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

// Initialize logger
let logger = null;

class SecurityHardeningEngine {
  constructor(config = {}) {
    // Initialize logger
    if (!logger) {
      logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'security-engine' },
        transports: [
          new winston.transports.Console()
        ]
      });
    }

    this.config = {
      // Encryption settings
      encryptionAlgorithm: config.encryptionAlgorithm || 'aes-256-gcm',
      encryptionKey: config.encryptionKey || process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
      
      // JWT authentication
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
      jwtAlgorithm: config.jwtAlgorithm || 'HS256',
      jwtExpiry: config.jwtExpiry || '24h',
      
      // API security
      enableRateLimiting: config.enableRateLimiting !== false,
      rateLimitWindow: config.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
      rateLimitMaxRequests: config.rateLimitMaxRequests || 100,
      enableCors: config.enableCors !== false,
      corsOrigins: config.corsOrigins || ['http://localhost:3000', 'https://localhost:3000'],
      
      // TLS/HTTPS
      enableTls: config.enableTls !== false,
      tlsCertPath: config.tlsCertPath || process.env.TLS_CERT_PATH,
      tlsKeyPath: config.tlsKeyPath || process.env.TLS_KEY_PATH,
      
      // Secrets management
      vaultUrl: config.vaultUrl || process.env.VAULT_URL,
      vaultToken: config.vaultToken || process.env.VAULT_TOKEN,
      
      // Security headers
      enableSecurityHeaders: config.enableSecurityHeaders !== false,
      enableHstsHeader: config.enableHstsHeader !== false,
      enableContentSecurityPolicy: config.enableContentSecurityPolicy !== false,
      
      // Audit logging
      enableAuditLogging: config.enableAuditLogging !== false,
      
      ...config
    };

    this.metrics = {
      tokensGenerated: 0,
      tokensValidated: 0,
      encryptionOperations: 0,
      decryptionOperations: 0,
      rateLimitExceeded: 0,
      securityViolations: 0,
      auditEventsLogged: 0,
      lastSecurityEventAt: null,
      errors: 0
    };

    this.rateLimitStore = new Map(); // In-memory rate limit store
  }

  /**
   * Generate JWT token
   */
  generateToken(payload, expiresIn = this.config.jwtExpiry) {
    try {
      const token = jwt.sign(payload, this.config.jwtSecret, {
        algorithm: this.config.jwtAlgorithm,
        expiresIn,
        issuer: 'fraud-detection-system',
        subject: payload.userId || payload.customerId,
        audience: 'api-clients'
      });

      this.metrics.tokensGenerated++;
      logger.info('JWT token generated', {
        userId: payload.userId,
        expiresIn
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate JWT token', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret, {
        algorithms: [this.config.jwtAlgorithm],
        issuer: 'fraud-detection-system',
        audience: 'api-clients'
      });

      this.metrics.tokensValidated++;
      logger.info('JWT token verified', { userId: decoded.subject });

      return decoded;
    } catch (error) {
      logger.warn('JWT token verification failed', { error: error.message });
      this.metrics.securityViolations++;
      throw error;
    }
  }

  /**
   * Encrypt sensitive data
   */
  encryptData(data, additionalData = null) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        this.config.encryptionAlgorithm,
        Buffer.from(this.config.encryptionKey, 'hex').slice(0, 32),
        iv
      );

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      this.metrics.encryptionOperations++;

      const result = {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag.toString('hex'),
        algorithm: this.config.encryptionAlgorithm
      };

      logger.debug('Data encrypted successfully');
      return result;
    } catch (error) {
      logger.error('Encryption failed', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Decrypt sensitive data
   */
  decryptData(encryptedPayload) {
    try {
      const decipher = crypto.createDecipheriv(
        encryptedPayload.algorithm || this.config.encryptionAlgorithm,
        Buffer.from(this.config.encryptionKey, 'hex').slice(0, 32),
        Buffer.from(encryptedPayload.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(encryptedPayload.authTag, 'hex'));

      let decrypted = decipher.update(encryptedPayload.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.metrics.decryptionOperations++;

      logger.debug('Data decrypted successfully');
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Decryption failed', { error: error.message });
      this.metrics.securityViolations++;
      throw error;
    }
  }

  /**
   * Hash password (bcrypt-like)
   */
  hashPassword(password, saltRounds = 10) {
    try {
      const salt = crypto.randomBytes(saltRounds).toString('hex');
      const hash = crypto
        .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
        .toString('hex');

      return `${salt}:${hash}`;
    } catch (error) {
      logger.error('Password hashing failed', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Verify password
   */
  verifyPassword(password, hash) {
    try {
      const [salt, storedHash] = hash.split(':');
      const verify = crypto
        .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
        .toString('hex');

      const isValid = verify === storedHash;

      if (!isValid) {
        this.metrics.securityViolations++;
      }

      return isValid;
    } catch (error) {
      logger.error('Password verification failed', { error: error.message });
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Rate limiting check
   */
  checkRateLimit(clientId, limit = this.config.rateLimitMaxRequests) {
    if (!this.config.enableRateLimiting) return true;

    try {
      const key = `ratelimit:${clientId}`;
      const now = Date.now();
      const window = this.config.rateLimitWindow;

      if (!this.rateLimitStore.has(key)) {
        this.rateLimitStore.set(key, []);
      }

      const requests = this.rateLimitStore.get(key);
      const validRequests = requests.filter(time => now - time < window);

      if (validRequests.length >= limit) {
        this.metrics.rateLimitExceeded++;
        logger.warn('Rate limit exceeded', { clientId, limit });
        return false;
      }

      validRequests.push(now);
      this.rateLimitStore.set(key, validRequests);

      return true;
    } catch (error) {
      logger.error('Rate limit check failed', { error: error.message });
      return true; // Fail open for availability
    }
  }

  /**
   * Generate API key
   */
  generateApiKey(clientId, clientName) {
    try {
      const apiKey = crypto.randomBytes(32).toString('hex');
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

      const keyMetadata = {
        clientId,
        clientName,
        keyId: uuidv4(),
        createdAt: new Date(),
        hashedKey,
        status: 'ACTIVE'
      };

      logger.info('API key generated', { clientId, keyId: keyMetadata.keyId });

      return {
        apiKey, // Only shown once
        keyMetadata
      };
    } catch (error) {
      logger.error('API key generation failed', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Validate API key
   */
  validateApiKey(apiKey, hashedKey) {
    try {
      const computedHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const isValid = computedHash === hashedKey;

      if (!isValid) {
        this.metrics.securityViolations++;
        logger.warn('Invalid API key used');
      }

      return isValid;
    } catch (error) {
      logger.error('API key validation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate security headers
   */
  getSecurityHeaders() {
    const headers = {};

    if (this.config.enableSecurityHeaders) {
      headers['X-Content-Type-Options'] = 'nosniff';
      headers['X-Frame-Options'] = 'DENY';
      headers['X-XSS-Protection'] = '1; mode=block';
      headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
      headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';
    }

    if (this.config.enableHstsHeader) {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
    }

    if (this.config.enableContentSecurityPolicy) {
      headers['Content-Security-Policy'] = 
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";
    }

    return headers;
  }

  /**
   * Get CORS configuration
   */
  getCorsConfig() {
    return {
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86400 // 24 hours
    };
  }

  /**
   * Audit security event
   */
  auditSecurityEvent(eventType, details) {
    try {
      if (!this.config.enableAuditLogging) return;

      const event = {
        eventId: uuidv4(),
        eventType,
        details,
        timestamp: new Date(),
        severity: this.getSeverity(eventType)
      };

      this.metrics.auditEventsLogged++;
      this.metrics.lastSecurityEventAt = new Date();

      logger.info('Security event audited', {
        eventId: event.eventId,
        eventType,
        severity: event.severity
      });

      return event;
    } catch (error) {
      logger.error('Failed to audit security event', { error: error.message });
      this.metrics.errors++;
    }
  }

  /**
   * Determine event severity
   */
  getSeverity(eventType) {
    const severityMap = {
      'AUTHENTICATION_FAILURE': 'HIGH',
      'AUTHORIZATION_FAILURE': 'HIGH',
      'ENCRYPTION_FAILURE': 'CRITICAL',
      'TOKEN_VALIDATION_FAILURE': 'HIGH',
      'RATE_LIMIT_EXCEEDED': 'MEDIUM',
      'INVALID_API_KEY': 'HIGH',
      'SECURITY_POLICY_VIOLATION': 'CRITICAL'
    };

    return severityMap[eventType] || 'MEDIUM';
  }

  /**
   * Rotate encryption key
   */
  rotateEncryptionKey(newKey) {
    try {
      const oldKey = this.config.encryptionKey;
      this.config.encryptionKey = newKey;

      logger.info('Encryption key rotated');
      this.auditSecurityEvent('KEY_ROTATION', { oldKeyHash: crypto.createHash('sha256').update(oldKey).digest('hex') });

      return true;
    } catch (error) {
      logger.error('Key rotation failed', { error: error.message });
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Get security metrics
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
  getHealth() {
    const health = {
      status: 'healthy',
      security: {
        encryptionEnabled: !!this.config.encryptionKey,
        jwtEnabled: !!this.config.jwtSecret,
        rateLimitingEnabled: this.config.enableRateLimiting,
        corsEnabled: this.config.enableCors,
        tlsEnabled: this.config.enableTls,
        auditLoggingEnabled: this.config.enableAuditLogging
      },
      metrics: this.getMetrics()
    };

    return health;
  }
}

module.exports = SecurityHardeningEngine;

// Start if run directly
if (require.main === module) {
  const securityEngine = new SecurityHardeningEngine();

  console.log('✓ Security Hardening Engine initialized');
  console.log('✓ Security Features:', {
    encryptionAlgorithm: securityEngine.config.encryptionAlgorithm,
    jwtAlgorithm: securityEngine.config.jwtAlgorithm,
    rateLimitingEnabled: securityEngine.config.enableRateLimiting,
    corsEnabled: securityEngine.config.enableCors,
    tlsEnabled: securityEngine.config.enableTls
  });
  console.log('✓ Health:', securityEngine.getHealth());
}

// Nicolas Larenas, nlarchive
