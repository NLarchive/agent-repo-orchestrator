#!/usr/bin/env node
/**
 * Data Enrichment Service
 * Enriches transactions with customer profiles, historical patterns, and external data sources
 * Supports customer segmentation, behavioral analysis, and risk scoring enhancement
 */

const postgres = require('postgres');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

let logger = null;

class DataEnrichmentService {
  constructor(config = {}) {
    // Initialize logger
    if (!logger) {
      logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'data-enrichment' },
        transports: [
          new winston.transports.Console()
        ]
      });
    }

    this.config = {
      postgresUrl: config.postgresUrl || process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/orchestrator',
      enableHistoricalAnalysis: config.enableHistoricalAnalysis !== false,
      enableCustomerSegmentation: config.enableCustomerSegmentation !== false,
      enableExternalEnrichment: config.enableExternalEnrichment !== false,
      lookbackDays: config.lookbackDays || 90,
      segmentationThresholds: config.segmentationThresholds || {
        highValue: 10000,
        frequentUser: 10,
        riskThreshold: 0.7
      },
      ...config
    };

    this.db = null;
    this.metrics = {
      enrichmentOperations: 0,
      profilesRetrieved: 0,
      patternsAnalyzed: 0,
      segmentationsCategorized: 0,
      externalDataIntegrated: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      timestamp: new Date()
    };

    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.cacheTTL = 3600000; // 1 hour in milliseconds
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    try {
      this.db = postgres(this.config.postgresUrl);
      
      // Test connection
      await this.db`SELECT 1`;
      
      logger.info('Data enrichment service initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize data enrichment service', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Enrich transaction with customer profile and historical data
   */
  async enrichTransaction(transaction) {
    try {
      if (!transaction || !transaction.customerId) {
        throw new Error('Invalid transaction: missing customerId');
      }

      this.metrics.enrichmentOperations++;

      const enrichedTransaction = {
        ...transaction,
        enrichment: {
          profile: null,
          patterns: null,
          segmentation: null,
          externalData: null,
          enrichmentScore: 0,
          timestamp: new Date()
        }
      };

      // Get customer profile
      if (this.config.enableCustomerSegmentation) {
        const profile = await this.getCustomerProfile(transaction.customerId);
        enrichedTransaction.enrichment.profile = profile;
        enrichedTransaction.enrichment.enrichmentScore += profile?.enrichmentScore || 0.2;
      }

      // Analyze historical patterns
      if (this.config.enableHistoricalAnalysis) {
        const patterns = await this.analyzeHistoricalPatterns(transaction);
        enrichedTransaction.enrichment.patterns = patterns;
        enrichedTransaction.enrichment.enrichmentScore += patterns?.anomalyScore || 0;
      }

      // Categorize customer segment
      if (this.config.enableCustomerSegmentation) {
        const segmentation = await this.categorizeCustomerSegment(transaction.customerId, enrichedTransaction.enrichment.profile);
        enrichedTransaction.enrichment.segmentation = segmentation;
      }

      // Integrate external data
      if (this.config.enableExternalEnrichment) {
        const externalData = await this.getExternalEnrichmentData(transaction);
        enrichedTransaction.enrichment.externalData = externalData;
        enrichedTransaction.enrichment.enrichmentScore += externalData?.riskScore || 0;
      }

      // Normalize enrichment score (0-1)
      enrichedTransaction.enrichment.enrichmentScore = Math.min(1, enrichedTransaction.enrichment.enrichmentScore);

      logger.debug('Transaction enriched successfully', {
        transactionId: transaction.id,
        enrichmentScore: enrichedTransaction.enrichment.enrichmentScore
      });

      return enrichedTransaction;
    } catch (error) {
      logger.error('Failed to enrich transaction', { error: error.message, transactionId: transaction?.id });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Get customer profile from database
   */
  async getCustomerProfile(customerId) {
    try {
      // Check cache first
      const cacheKey = `profile:${customerId}`;
      if (this.cache.has(cacheKey) && this.cacheExpiry.get(cacheKey) > Date.now()) {
        this.metrics.cacheHits++;
        return this.cache.get(cacheKey);
      }

      this.metrics.cacheMisses++;
      this.metrics.profilesRetrieved++;

      // Query database for customer profile
      const profiles = await this.db`
        SELECT 
          customer_id,
          customer_name,
          account_age,
          total_transactions,
          avg_transaction_amount,
          account_status,
          kycStatus,
          pep_status,
          created_at,
          last_transaction_date
        FROM customer_profiles
        WHERE customer_id = ${customerId}
        LIMIT 1
      `;

      if (profiles.length === 0) {
        // Return default profile for unknown customer
        return {
          customerId,
          enrichmentScore: 0.3,
          accountAge: 0,
          totalTransactions: 0,
          avgTransactionAmount: 0,
          accountStatus: 'NEW',
          kycStatus: 'PENDING',
          pepStatus: false
        };
      }

      const profile = profiles[0];
      const enrichedProfile = {
        customerId: profile.customer_id,
        customerName: profile.customer_name,
        accountAge: Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24)),
        totalTransactions: profile.total_transactions,
        avgTransactionAmount: profile.avg_transaction_amount,
        accountStatus: profile.account_status,
        kycStatus: profile.kycStatus || 'PENDING',
        pepStatus: profile.pep_status || false,
        lastTransactionDate: profile.last_transaction_date,
        enrichmentScore: 0.7 // Established customer
      };

      // Cache the profile
      this.cache.set(cacheKey, enrichedProfile);
      this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTTL);

      return enrichedProfile;
    } catch (error) {
      logger.error('Failed to get customer profile', { error: error.message, customerId });
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Analyze historical patterns for anomaly detection
   */
  async analyzeHistoricalPatterns(transaction) {
    try {
      this.metrics.patternsAnalyzed++;

      // Query recent transactions for pattern analysis
      const lookbackDate = new Date(Date.now() - this.config.lookbackDays * 24 * 60 * 60 * 1000);

      const recentTransactions = await this.db`
        SELECT 
          amount,
          merchant_category,
          country,
          transaction_date
        FROM transactions
        WHERE customer_id = ${transaction.customerId}
          AND transaction_date > ${lookbackDate}
        ORDER BY transaction_date DESC
        LIMIT 50
      `;

      if (recentTransactions.length === 0) {
        return {
          transactionCount: 0,
          avgAmountDeviation: 0,
          merchantCategoryDeviation: 0,
          geographicDeviation: 0,
          anomalyScore: 0
        };
      }

      // Calculate statistics
      const amounts = recentTransactions.map(t => t.amount);
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stdDevAmount = Math.sqrt(
        amounts.reduce((sq, n) => sq + Math.pow(n - avgAmount, 2), 0) / amounts.length
      );

      // Detect anomalies
      const currentAmountDeviation = Math.abs(transaction.amount - avgAmount) / (stdDevAmount || 1);
      
      const merchantCategories = recentTransactions.map(t => t.merchant_category);
      const merchantDiversity = new Set(merchantCategories).size / merchantCategories.length;
      const merchantCategoryDeviation = !merchantCategories.includes(transaction.merchantCategory) ? 0.5 : 0;

      const countries = recentTransactions.map(t => t.country);
      const countryDeviation = !countries.includes(transaction.country) ? 0.3 : 0;

      const anomalyScore = Math.min(1, 
        (Math.min(currentAmountDeviation / 3, 1) * 0.4) + 
        (merchantCategoryDeviation * 0.3) + 
        (countryDeviation * 0.3)
      );

      return {
        transactionCount: recentTransactions.length,
        avgAmount,
        stdDevAmount,
        amountDeviation: currentAmountDeviation,
        merchantCategoryDeviation,
        geographicDeviation: countryDeviation,
        anomalyScore
      };
    } catch (error) {
      logger.error('Failed to analyze historical patterns', { error: error.message, customerId: transaction?.customerId });
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Categorize customer into segments based on behavior
   */
  async categorizeCustomerSegment(customerId, profile) {
    try {
      this.metrics.segmentationsCategorized++;

      if (!profile) {
        return { segment: 'UNKNOWN', riskLevel: 'MEDIUM' };
      }

      let segment = 'STANDARD';
      let riskLevel = 'MEDIUM';

      // High-value customer segmentation
      if (profile.totalTransactions >= this.config.segmentationThresholds.frequentUser &&
          profile.avgTransactionAmount >= this.config.segmentationThresholds.highValue) {
        segment = 'HIGH_VALUE';
        riskLevel = 'LOW';
      }
      // Frequent user segmentation
      else if (profile.totalTransactions >= this.config.segmentationThresholds.frequentUser) {
        segment = 'FREQUENT_USER';
        riskLevel = 'LOW';
      }
      // New account risk
      else if (profile.accountAge < 30) {
        segment = 'NEW_ACCOUNT';
        riskLevel = 'HIGH';
      }
      // Inactive account
      else if (!profile.lastTransactionDate || 
               (Date.now() - new Date(profile.lastTransactionDate).getTime()) > 180 * 24 * 60 * 60 * 1000) {
        segment = 'DORMANT';
        riskLevel = 'MEDIUM';
      }

      // PEP or KYC risk
      if (profile.pepStatus || profile.kycStatus !== 'APPROVED') {
        riskLevel = 'HIGH';
      }

      return {
        segment,
        riskLevel,
        accountAge: profile.accountAge,
        totalTransactions: profile.totalTransactions
      };
    } catch (error) {
      logger.error('Failed to categorize customer segment', { error: error.message, customerId });
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Get external enrichment data (simulated)
   */
  async getExternalEnrichmentData(transaction) {
    try {
      this.metrics.externalDataIntegrated++;

      // Simulate external data enrichment (credit bureau, sanctions list, etc.)
      const externalData = {
        creditScore: 600 + Math.floor(Math.random() * 400), // 600-1000
        sanctionsListMatch: Math.random() < 0.01, // 1% chance
        deviceFingerprintMatch: Math.random() < 0.05, // 5% chance
        velocityScore: 0,
        riskScore: 0,
        externalSources: ['credit_bureau', 'sanctions_database', 'device_fingerprint']
      };

      // Calculate risk score from external data
      let riskScore = 0;
      if (externalData.sanctionsListMatch) {
        riskScore += 0.8;
      }
      if (externalData.creditScore < 600) {
        riskScore += 0.3;
      }
      if (externalData.deviceFingerprintMatch) {
        riskScore += 0.2;
      }

      externalData.riskScore = Math.min(1, riskScore);

      logger.debug('External enrichment data retrieved', {
        transactionId: transaction.id,
        riskScore: externalData.riskScore
      });

      return externalData;
    } catch (error) {
      logger.error('Failed to get external enrichment data', { error: error.message });
      this.metrics.errors++;
      return null;
    }
  }

  /**
   * Batch enrich multiple transactions
   */
  async enrichBatch(transactions) {
    try {
      const enrichedTransactions = await Promise.all(
        transactions.map(t => this.enrichTransaction(t).catch(error => {
          logger.warn('Skipped transaction enrichment', { error: error.message, transactionId: t?.id });
          return t; // Return original transaction if enrichment fails
        }))
      );

      logger.info('Batch enrichment completed', {
        totalTransactions: transactions.length,
        successfulEnrichments: enrichedTransactions.filter(t => t.enrichment).length
      });

      return enrichedTransactions;
    } catch (error) {
      logger.error('Failed to enrich batch', { error: error.message });
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Clear cache for a specific customer
   */
  clearCustomerCache(customerId) {
    const cacheKey = `profile:${customerId}`;
    this.cache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
    logger.debug('Customer cache cleared', { customerId });
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    logger.info('All cache cleared');
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date(),
      cacheSize: this.cache.size
    };
  }

  /**
   * Get health status
   */
  async getHealth() {
    try {
      const dbHealthy = this.db ? await this.db`SELECT 1` : false;

      return {
        status: dbHealthy ? 'healthy' : 'degraded',
        database: !!dbHealthy,
        enrichmentEnabled: this.config.enableCustomerSegmentation,
        historyAnalysisEnabled: this.config.enableHistoricalAnalysis,
        externalEnrichmentEnabled: this.config.enableExternalEnrichment,
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
   * Close database connection
   */
  async close() {
    if (this.db) {
      await this.db.end();
      logger.info('Data enrichment service closed');
    }
  }
}

module.exports = DataEnrichmentService;

// Nicolas Larenas, nlarchive
