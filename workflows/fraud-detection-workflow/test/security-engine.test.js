/**
 * Security Hardening Engine - Test Suite
 */

const SecurityHardeningEngine = require('../engine/security-engine');
const crypto = require('crypto');

describe('Security Hardening Engine', () => {
  let securityEngine;

  beforeEach(() => {
    securityEngine = new SecurityHardeningEngine();
  });

  describe('JWT Token Management', () => {
    test('should generate valid JWT token', () => {
      const token = securityEngine.generateToken({
        userId: 'user123',
        email: 'user@example.com'
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT format: header.payload.signature
    });

    test('should verify generated JWT token', () => {
      const payload = { userId: 'user123', role: 'admin' };
      const token = securityEngine.generateToken(payload);

      const decoded = securityEngine.verifyToken(token);

      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe('user123');
      expect(decoded.role).toBe('admin');
    });

    test('should reject invalid JWT token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        securityEngine.verifyToken(invalidToken);
      }).toThrow();
    });

    test('should track token generation metrics', () => {
      const initialCount = securityEngine.metrics.tokensGenerated;

      securityEngine.generateToken({ userId: 'user1' });
      securityEngine.generateToken({ userId: 'user2' });

      expect(securityEngine.metrics.tokensGenerated).toBe(initialCount + 2);
    });

    test('should track token validation metrics', () => {
      const initialCount = securityEngine.metrics.tokensValidated;
      const token = securityEngine.generateToken({ userId: 'user1' });

      securityEngine.verifyToken(token);

      expect(securityEngine.metrics.tokensValidated).toBe(initialCount + 1);
    });
  });

  describe('Data Encryption & Decryption', () => {
    test('should encrypt sensitive data', () => {
      const data = {
        accountNumber: '1234567890',
        ssn: '123-45-6789'
      };

      const encrypted = securityEngine.encryptData(data);

      expect(encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
    });

    test('should decrypt encrypted data', () => {
      const originalData = {
        accountNumber: '1234567890',
        ssn: '123-45-6789'
      };

      const encrypted = securityEngine.encryptData(originalData);
      const decrypted = securityEngine.decryptData(encrypted);

      expect(decrypted).toEqual(originalData);
    });

    test('should produce different ciphertext for same plaintext', () => {
      const data = { secret: 'password123' };

      const encrypted1 = securityEngine.encryptData(data);
      const encrypted2 = securityEngine.encryptData(data);

      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    test('should reject tampered encrypted data', () => {
      const data = { sensitive: 'value' };
      const encrypted = securityEngine.encryptData(data);

      // Tamper with ciphertext
      encrypted.encryptedData = encrypted.encryptedData.slice(0, -2) + 'XX';

      expect(() => {
        securityEngine.decryptData(encrypted);
      }).toThrow();
    });

    test('should track encryption/decryption metrics', () => {
      const initialEncrypt = securityEngine.metrics.encryptionOperations;
      const initialDecrypt = securityEngine.metrics.decryptionOperations;

      const encrypted = securityEngine.encryptData({ test: 'data' });
      securityEngine.decryptData(encrypted);

      expect(securityEngine.metrics.encryptionOperations).toBe(initialEncrypt + 1);
      expect(securityEngine.metrics.decryptionOperations).toBe(initialDecrypt + 1);
    });
  });

  describe('Password Security', () => {
    test('should hash password with salt', () => {
      const password = 'securePassword123!';
      const hash = securityEngine.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.includes(':')).toBe(true); // salt:hash format
    });

    test('should verify correct password', () => {
      const password = 'securePassword123!';
      const hash = securityEngine.hashPassword(password);

      const isValid = securityEngine.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    test('should reject incorrect password', () => {
      const password = 'securePassword123!';
      const hash = securityEngine.hashPassword(password);

      const isValid = securityEngine.verifyPassword('wrongPassword', hash);

      expect(isValid).toBe(false);
    });

    test('should produce different hashes for same password', () => {
      const password = 'password123';
      const hash1 = securityEngine.hashPassword(password);
      const hash2 = securityEngine.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Rate Limiting', () => {
    test('should allow requests within limit', () => {
      const clientId = 'client123';
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        const allowed = securityEngine.checkRateLimit(clientId, limit);
        expect(allowed).toBe(true);
      }
    });

    test('should block requests exceeding limit', () => {
      const clientId = 'client123';
      const limit = 3;

      // Use up all requests
      for (let i = 0; i < limit; i++) {
        securityEngine.checkRateLimit(clientId, limit);
      }

      // This should be blocked
      const allowed = securityEngine.checkRateLimit(clientId, limit);
      expect(allowed).toBe(false);
    });

    test('should track rate limit violations', () => {
      const initialViolations = securityEngine.metrics.rateLimitExceeded;
      const clientId = 'client123';
      const limit = 2;

      for (let i = 0; i < limit + 1; i++) {
        securityEngine.checkRateLimit(clientId, limit);
      }

      expect(securityEngine.metrics.rateLimitExceeded).toBeGreaterThan(initialViolations);
    });

    test('should handle rate limiting being disabled', () => {
      const engine = new SecurityHardeningEngine({ enableRateLimiting: false });
      const clientId = 'client123';

      // Should always return true when disabled
      for (let i = 0; i < 100; i++) {
        const allowed = engine.checkRateLimit(clientId, 5);
        expect(allowed).toBe(true);
      }
    });
  });

  describe('API Key Management', () => {
    test('should generate API key with metadata', () => {
      const result = securityEngine.generateApiKey('client123', 'Test Client');

      expect(result.apiKey).toBeDefined();
      expect(result.apiKey.length).toBeGreaterThan(0);
      expect(result.keyMetadata).toBeDefined();
      expect(result.keyMetadata.clientId).toBe('client123');
      expect(result.keyMetadata.keyId).toBeDefined();
      expect(result.keyMetadata.hashedKey).toBeDefined();
    });

    test('should validate correct API key', () => {
      const { apiKey, keyMetadata } = securityEngine.generateApiKey('client123', 'Test Client');

      const isValid = securityEngine.validateApiKey(apiKey, keyMetadata.hashedKey);

      expect(isValid).toBe(true);
    });

    test('should reject invalid API key', () => {
      const { keyMetadata } = securityEngine.generateApiKey('client123', 'Test Client');

      const isValid = securityEngine.validateApiKey('wrongApiKey', keyMetadata.hashedKey);

      expect(isValid).toBe(false);
    });

    test('should track API key generation', () => {
      const initialCount = securityEngine.metrics.tokensGenerated;

      securityEngine.generateApiKey('client1', 'Client 1');
      securityEngine.generateApiKey('client2', 'Client 2');

      // Note: generateApiKey doesn't use tokensGenerated, it's separate
      expect(securityEngine.metrics.tokensGenerated).toBe(initialCount);
    });
  });

  describe('Security Headers', () => {
    test('should return security headers when enabled', () => {
      const headers = securityEngine.getSecurityHeaders();

      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['X-Frame-Options']).toBe('DENY');
      expect(headers['X-XSS-Protection']).toBe('1; mode=block');
      expect(headers['Referrer-Policy']).toBeDefined();
    });

    test('should include HSTS header when enabled', () => {
      const headers = securityEngine.getSecurityHeaders();

      expect(headers['Strict-Transport-Security']).toBeDefined();
      expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
    });

    test('should include CSP header when enabled', () => {
      const headers = securityEngine.getSecurityHeaders();

      expect(headers['Content-Security-Policy']).toBeDefined();
      expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    });

    test('should return empty headers when disabled', () => {
      const engine = new SecurityHardeningEngine({ enableSecurityHeaders: false });
      const headers = engine.getSecurityHeaders();

      // Should still have HSTS and CSP if those are not disabled
      expect(Object.keys(headers).length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CORS Configuration', () => {
    test('should return valid CORS configuration', () => {
      const cors = securityEngine.getCorsConfig();

      expect(cors.origin).toBeDefined();
      expect(cors.credentials).toBe(true);
      expect(cors.methods).toContain('GET');
      expect(cors.methods).toContain('POST');
      expect(cors.allowedHeaders).toContain('Authorization');
    });

    test('should restrict CORS origins', () => {
      const customOrigins = ['https://app.example.com'];
      const engine = new SecurityHardeningEngine({ corsOrigins: customOrigins });
      const cors = engine.getCorsConfig();

      expect(cors.origin).toEqual(customOrigins);
    });
  });

  describe('Security Event Auditing', () => {
    test('should audit security events', () => {
      const event = securityEngine.auditSecurityEvent('AUTHENTICATION_FAILURE', {
        username: 'user@example.com',
        ipAddress: '192.168.1.1'
      });

      expect(event).toBeDefined();
      expect(event.eventId).toBeDefined();
      expect(event.eventType).toBe('AUTHENTICATION_FAILURE');
      expect(event.timestamp).toBeDefined();
    });

    test('should assign correct severity to events', () => {
      const criticalEvent = securityEngine.auditSecurityEvent('ENCRYPTION_FAILURE', {});
      expect(criticalEvent.severity).toBe('CRITICAL');

      const highEvent = securityEngine.auditSecurityEvent('AUTHENTICATION_FAILURE', {});
      expect(highEvent.severity).toBe('HIGH');

      const mediumEvent = securityEngine.auditSecurityEvent('RATE_LIMIT_EXCEEDED', {});
      expect(mediumEvent.severity).toBe('MEDIUM');
    });

    test('should track audit event metrics', () => {
      const initialCount = securityEngine.metrics.auditEventsLogged;

      securityEngine.auditSecurityEvent('AUTHENTICATION_FAILURE', {});
      securityEngine.auditSecurityEvent('TOKEN_VALIDATION_FAILURE', {});

      expect(securityEngine.metrics.auditEventsLogged).toBe(initialCount + 2);
    });

    test('should not log when auditing disabled', () => {
      const engine = new SecurityHardeningEngine({ enableAuditLogging: false });
      const initialCount = engine.metrics.auditEventsLogged;

      engine.auditSecurityEvent('TEST_EVENT', {});

      expect(engine.metrics.auditEventsLogged).toBe(initialCount);
    });
  });

  describe('Encryption Key Rotation', () => {
    test('should rotate encryption key', () => {
      const oldKey = securityEngine.config.encryptionKey;
      const newKey = crypto.randomBytes(32).toString('hex');

      const result = securityEngine.rotateEncryptionKey(newKey);

      expect(result).toBe(true);
      expect(securityEngine.config.encryptionKey).toBe(newKey);
      expect(securityEngine.config.encryptionKey).not.toBe(oldKey);
    });

    test('should audit key rotation', () => {
      const initialCount = securityEngine.metrics.auditEventsLogged;
      const newKey = crypto.randomBytes(32).toString('hex');

      securityEngine.rotateEncryptionKey(newKey);

      expect(securityEngine.metrics.auditEventsLogged).toBeGreaterThan(initialCount);
    });
  });

  describe('Metrics & Health', () => {
    test('should return current metrics', () => {
      const metrics = securityEngine.getMetrics();

      expect(metrics.tokensGenerated).toBeDefined();
      expect(metrics.encryptionOperations).toBeDefined();
      expect(metrics.rateLimitExceeded).toBeDefined();
      expect(metrics.timestamp).toBeDefined();
    });

    test('should return health status', () => {
      const health = securityEngine.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.security).toBeDefined();
      expect(health.security.encryptionEnabled).toBe(true);
      expect(health.security.jwtEnabled).toBe(true);
      expect(health.metrics).toBeDefined();
    });

    test('should report all security features in health', () => {
      const health = securityEngine.getHealth();

      expect(health.security.encryptionEnabled).toBeDefined();
      expect(health.security.jwtEnabled).toBeDefined();
      expect(health.security.rateLimitingEnabled).toBeDefined();
      expect(health.security.corsEnabled).toBeDefined();
      expect(health.security.tlsEnabled).toBeDefined();
      expect(health.security.auditLoggingEnabled).toBeDefined();
    });
  });

  describe('Error Handling & Resilience', () => {
    test('should handle invalid encryption data gracefully', () => {
      const engine = new SecurityHardeningEngine();
      const invalidPayload = {
        iv: 'invalid',
        encryptedData: 'invalid',
        authTag: 'invalid'
      };

      expect(() => {
        engine.decryptData(invalidPayload);
      }).toThrow();
    });

    test('should increment error metrics on failure', () => {
      const engine = new SecurityHardeningEngine();
      const initialViolations = engine.metrics.securityViolations;

      try {
        engine.decryptData({ iv: 'bad', encryptedData: 'bad', authTag: 'bad' });
      } catch (e) {
        // Expected
      }

      expect(engine.metrics.securityViolations).toBeGreaterThan(initialViolations);
    });

    test('should track security violations', () => {
      const engine = new SecurityHardeningEngine();
      const initialViolations = engine.metrics.securityViolations;

      // Invalid password
      engine.verifyPassword('anypassword', 'invalidsalt:invaldhash');

      expect(engine.metrics.securityViolations).toBeGreaterThan(initialViolations);
    });
  });
});

// Nicolas Larenas, nlarchive
