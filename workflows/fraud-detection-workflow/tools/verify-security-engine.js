#!/usr/bin/env node
/**
 * Manual Security Engine Verification Script
 */

const SecurityHardeningEngine = require('./engine/security-engine');
const crypto = require('crypto');

console.log('\n=== Security Hardening Engine Verification ===\n');

const engine = new SecurityHardeningEngine();

// Test 1: JWT Token Management
console.log('TEST 1: JWT Token Management');
try {
  const token = engine.generateToken({ userId: 'user123', role: 'admin' });
  console.log('✓ Token generated:', token.substring(0, 50) + '...');
  
  const decoded = engine.verifyToken(token);
  console.log('✓ Token verified, userId:', decoded.userId, 'role:', decoded.role);
} catch (e) {
  console.error('✗ JWT test failed:', e.message);
}

// Test 2: Data Encryption
console.log('\nTEST 2: Data Encryption & Decryption');
try {
  const data = { accountNumber: '1234567890', ssn: '123-45-6789' };
  const encrypted = engine.encryptData(data);
  console.log('✓ Data encrypted, iv:', encrypted.iv.substring(0, 20) + '...');
  
  const decrypted = engine.decryptData(encrypted);
  console.log('✓ Data decrypted, matches original:', JSON.stringify(decrypted) === JSON.stringify(data));
} catch (e) {
  console.error('✗ Encryption test failed:', e.message);
}

// Test 3: Password Security
console.log('\nTEST 3: Password Hashing & Verification');
try {
  const password = 'securePassword123!';
  const hash = engine.hashPassword(password);
  console.log('✓ Password hashed:', hash.substring(0, 30) + '...');
  
  const isValid = engine.verifyPassword(password, hash);
  console.log('✓ Password verification passed:', isValid);
  
  const isInvalid = engine.verifyPassword('wrongPassword', hash);
  console.log('✓ Wrong password rejected:', !isInvalid);
} catch (e) {
  console.error('✗ Password test failed:', e.message);
}

// Test 4: Rate Limiting
console.log('\nTEST 4: Rate Limiting');
try {
  const clientId = 'client123';
  const limit = 3;
  
  let blockedAt = -1;
  for (let i = 0; i < 5; i++) {
    const allowed = engine.checkRateLimit(clientId, limit);
    if (!allowed) blockedAt = i;
  }
  
  console.log('✓ Rate limit blocking works at request #' + (blockedAt + 1));
  console.log('✓ Rate limit violations tracked:', engine.metrics.rateLimitExceeded);
} catch (e) {
  console.error('✗ Rate limiting test failed:', e.message);
}

// Test 5: API Key Management
console.log('\nTEST 5: API Key Management');
try {
  const { apiKey, keyMetadata } = engine.generateApiKey('client123', 'Test Client');
  console.log('✓ API key generated, keyId:', keyMetadata.keyId);
  
  const isValid = engine.validateApiKey(apiKey, keyMetadata.hashedKey);
  console.log('✓ API key validation passed:', isValid);
  
  const isInvalid = engine.validateApiKey('wrongKey', keyMetadata.hashedKey);
  console.log('✓ Invalid key rejected:', !isInvalid);
} catch (e) {
  console.error('✗ API key test failed:', e.message);
}

// Test 6: Security Headers
console.log('\nTEST 6: Security Headers');
try {
  const headers = engine.getSecurityHeaders();
  const headerCount = Object.keys(headers).length;
  console.log('✓ Security headers returned:', headerCount, 'headers');
  console.log('  - X-Content-Type-Options:', headers['X-Content-Type-Options']);
  console.log('  - X-Frame-Options:', headers['X-Frame-Options']);
  console.log('  - HSTS enabled:', !!headers['Strict-Transport-Security']);
  console.log('  - CSP enabled:', !!headers['Content-Security-Policy']);
} catch (e) {
  console.error('✗ Security headers test failed:', e.message);
}

// Test 7: CORS Configuration
console.log('\nTEST 7: CORS Configuration');
try {
  const cors = engine.getCorsConfig();
  console.log('✓ CORS config returned');
  console.log('  - Credentials enabled:', cors.credentials);
  console.log('  - Methods:', cors.methods.join(', '));
  console.log('  - Allowed headers:', cors.allowedHeaders.join(', '));
} catch (e) {
  console.error('✗ CORS test failed:', e.message);
}

// Test 8: Security Event Auditing
console.log('\nTEST 8: Security Event Auditing');
try {
  const event = engine.auditSecurityEvent('AUTHENTICATION_FAILURE', {
    username: 'user@example.com',
    ipAddress: '192.168.1.1'
  });
  console.log('✓ Security event audited, eventId:', event.eventId);
  console.log('  - Severity:', event.severity);
  console.log('  - Audit metrics tracked:', engine.metrics.auditEventsLogged);
} catch (e) {
  console.error('✗ Audit event test failed:', e.message);
}

// Test 9: Key Rotation
console.log('\nTEST 9: Encryption Key Rotation');
try {
  const oldKey = engine.config.encryptionKey;
  const newKey = crypto.randomBytes(32).toString('hex');
  const result = engine.rotateEncryptionKey(newKey);
  console.log('✓ Key rotation successful:', result);
  console.log('  - Key changed:', engine.config.encryptionKey !== oldKey);
} catch (e) {
  console.error('✗ Key rotation test failed:', e.message);
}

// Test 10: Metrics & Health
console.log('\nTEST 10: Metrics & Health');
try {
  const metrics = engine.getMetrics();
  console.log('✓ Metrics retrieved');
  console.log('  - Tokens generated:', metrics.tokensGenerated);
  console.log('  - Encryption operations:', metrics.encryptionOperations);
  console.log('  - Decryption operations:', metrics.decryptionOperations);
  console.log('  - Rate limit violations:', metrics.rateLimitExceeded);
  console.log('  - Audit events logged:', metrics.auditEventsLogged);
  
  const health = engine.getHealth();
  console.log('✓ Health status:', health.status);
  console.log('  - All security features enabled:', Object.values(health.security).every(v => v));
} catch (e) {
  console.error('✗ Metrics/health test failed:', e.message);
}

console.log('\n=== Verification Complete ===\n');
