#!/usr/bin/env node

/**
 * Dynamic Risk Scoring Engine
 * 
 * Configurable risk engine with weighted factors, threshold profiles, and real-time scoring.
 * Supports multiple risk models and A/B testing.
 * 
 * Usage:
 *   const RiskEngine = require('./risk-scoring-engine');
 *   const engine = new RiskEngine(configPath);
 *   const result = engine.score(transaction);
 */

const fs = require('fs');
const path = require('path');

class RiskScoringEngine {
  constructor(configPath = null) {
    this.config = this.loadConfig(configPath);
    this.activeProfile = this.config.active_profile || 'default';
  }

  loadConfig(configPath) {
    const defaultConfig = {
      version: '1.0',
      active_profile: 'default',
      profiles: {
        default: {
          name: 'Default Risk Profile',
          description: 'Balanced risk detection for general use',
          threshold: 0.5,
          weights: {
            amount_spike: 30,
            amount_extreme: 40,
            amount_deviation: 15,
            round_amount: 8,
            foreign_country: 25,
            far_from_home: 15,
            very_far_from_home: 25,
            high_velocity: 20,
            extreme_velocity: 35,
            night_activity: 10,
            web_channel: 5,
            device_change: 20,
            merchant_velocity: 15
          },
          normalization: {
            method: 'sigmoid',
            center: 50,
            spread: 12
          }
        },
        conservative: {
          name: 'Conservative Profile',
          description: 'Lower threshold, higher sensitivity',
          threshold: 0.3,
          weights: {
            amount_spike: 35,
            amount_extreme: 50,
            amount_deviation: 20,
            round_amount: 10,
            foreign_country: 30,
            far_from_home: 20,
            very_far_from_home: 35,
            high_velocity: 25,
            extreme_velocity: 45,
            night_activity: 15,
            web_channel: 8,
            device_change: 25,
            merchant_velocity: 20
          },
          normalization: {
            method: 'sigmoid',
            center: 45,
            spread: 10
          }
        },
        aggressive: {
          name: 'Aggressive Profile',
          description: 'Higher threshold, fewer false positives',
          threshold: 0.7,
          weights: {
            amount_spike: 20,
            amount_extreme: 30,
            amount_deviation: 10,
            round_amount: 5,
            foreign_country: 15,
            far_from_home: 10,
            very_far_from_home: 20,
            high_velocity: 15,
            extreme_velocity: 25,
            night_activity: 5,
            web_channel: 3,
            device_change: 15,
            merchant_velocity: 10
          },
          normalization: {
            method: 'sigmoid',
            center: 60,
            spread: 15
          }
        }
      }
    };

    if (configPath && fs.existsSync(configPath)) {
      try {
        const custom = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return { ...defaultConfig, ...custom };
      } catch (err) {
        console.warn(`Failed to load config from ${configPath}, using defaults:`, err.message);
        return defaultConfig;
      }
    }
    return defaultConfig;
  }

  setProfile(profileName) {
    if (this.config.profiles[profileName]) {
      this.activeProfile = profileName;
      return true;
    }
    console.warn(`Profile ${profileName} not found, keeping ${this.activeProfile}`);
    return false;
  }

  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Score a transaction
   * @param {Object} txn - Transaction object with numeric/string fields
   * @returns {Object} - { score, proba, prediction, factors, contributions, profile }
   */
  score(txn) {
    const profile = this.config.profiles[this.activeProfile];
    const weights = profile.weights;
    const threshold = profile.threshold;

    const amount = parseFloat(txn.amount) || 0;
    const isForeign = parseInt(txn.is_foreign, 10) === 1;
    const prev1h = parseInt(txn.previous_txn_count_1h, 10) || 0;
    const distKm = parseFloat(txn.distance_from_home_km) || 0;
    const hour = parseInt(txn.hour, 10) || 0;
    const channel = txn.channel || 'web';
    const avg7d = parseFloat(txn.avg_amount_7d) || 60;
    const deviceId = txn.device_id || '';
    const merchantId = txn.merchant_id || '';

    let score = 0;
    const factors = [];
    const contributions = {};

    // Amount profiling
    if (amount > 1000) {
      score += weights.amount_spike;
      factors.push('amt>1k');
      contributions['amount_spike'] = weights.amount_spike;
    }
    if (amount > 5000) {
      score += weights.amount_extreme;
      factors.push('amt>5k');
      contributions['amount_extreme'] = weights.amount_extreme;
    }
    if (avg7d > 0 && amount > avg7d * 3) {
      score += weights.amount_deviation;
      factors.push('amt-3x-avg');
      contributions['amount_deviation'] = weights.amount_deviation;
    }
    if (amount % 100 === 0 && amount >= 100) {
      score += weights.round_amount;
      factors.push('round-amt');
      contributions['round_amount'] = weights.round_amount;
    }

    // Geographic
    if (isForeign) {
      score += weights.foreign_country;
      factors.push('foreign');
      contributions['foreign_country'] = weights.foreign_country;
    }
    if (distKm > 1000) {
      score += weights.far_from_home;
      factors.push('far-from-home');
      contributions['far_from_home'] = weights.far_from_home;
    }
    if (distKm > 5000) {
      score += weights.very_far_from_home;
      factors.push('very-far');
      contributions['very_far_from_home'] = weights.very_far_from_home;
    }

    // Velocity
    if (prev1h > 5) {
      score += weights.high_velocity;
      factors.push('high-velocity');
      contributions['high_velocity'] = weights.high_velocity;
    }
    if (prev1h > 10) {
      score += weights.extreme_velocity;
      factors.push('extreme-velocity');
      contributions['extreme_velocity'] = weights.extreme_velocity;
    }

    // Behavioral
    if (hour >= 0 && hour <= 5) {
      score += weights.night_activity;
      factors.push('night');
      contributions['night_activity'] = weights.night_activity;
    }
    if (channel === 'web') {
      score += weights.web_channel;
      factors.push('web');
      contributions['web_channel'] = weights.web_channel;
    }

    // Device & Merchant
    if (deviceId.startsWith('D9')) {
      score += weights.device_change;
      factors.push('new-device');
      contributions['device_change'] = weights.device_change;
    }
    if (merchantId.startsWith('M1')) {
      score += weights.merchant_velocity;
      factors.push('risky-merchant');
      contributions['merchant_velocity'] = weights.merchant_velocity;
    }

    // Normalization
    const norm = profile.normalization;
    let proba = 0;
    if (norm.method === 'sigmoid') {
      proba = this.sigmoid((score - norm.center) / norm.spread);
    } else {
      // linear fallback
      proba = Math.min(1, Math.max(0, score / 100));
    }

    const prediction = proba >= threshold ? 1 : 0;

    return {
      score,
      proba,
      prediction,
      factors: factors.join('|'),
      contributions,
      profile: this.activeProfile,
      threshold
    };
  }

  /**
   * Batch score transactions
   */
  scoreBatch(transactions) {
    return transactions.map(txn => this.score(txn));
  }

  /**
   * Export current config
   */
  exportConfig(outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(this.config, null, 2), 'utf8');
    console.log(`✅ Config exported to ${outputPath}`);
  }

  /**
   * Get summary stats for a profile
   */
  getProfileSummary(profileName = null) {
    const name = profileName || this.activeProfile;
    const profile = this.config.profiles[name];
    if (!profile) return null;

    const totalWeight = Object.values(profile.weights).reduce((a, b) => a + b, 0);
    const factorCount = Object.keys(profile.weights).length;

    return {
      name: profile.name,
      description: profile.description,
      threshold: profile.threshold,
      total_weight: totalWeight,
      factor_count: factorCount,
      weights: profile.weights,
      normalization: profile.normalization
    };
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'export') {
    const configPath = args[1] || null;
    const outputPath = args[2] || path.resolve(__dirname, '../config/risk-engine-config.json');
    const engine = new RiskScoringEngine(configPath);
    engine.exportConfig(outputPath);
  } else if (command === 'test') {
    const engine = new RiskScoringEngine();
    const testTxn = {
      amount: 6000,
      is_foreign: 1,
      previous_txn_count_1h: 12,
      distance_from_home_km: 3500,
      hour: 2,
      channel: 'web',
      avg_amount_7d: 150,
      device_id: 'D98765',
      merchant_id: 'M12345'
    };
    console.log('\n🧪 Test Transaction Scoring\n');
    for (const profile of ['default', 'conservative', 'aggressive']) {
      engine.setProfile(profile);
      const result = engine.score(testTxn);
      console.log(`Profile: ${profile}`);
      console.log(`  Score: ${result.score.toFixed(2)}, Proba: ${result.proba.toFixed(4)}, Prediction: ${result.prediction}`);
      console.log(`  Factors: ${result.factors}`);
      console.log('');
    }
  } else if (command === 'summary') {
    const engine = new RiskScoringEngine();
    for (const profile of ['default', 'conservative', 'aggressive']) {
      const summary = engine.getProfileSummary(profile);
      console.log(`\n📊 ${summary.name}`);
      console.log(`   ${summary.description}`);
      console.log(`   Threshold: ${summary.threshold}, Total Weight: ${summary.total_weight}, Factors: ${summary.factor_count}`);
    }
  } else {
    console.log(`
Risk Scoring Engine CLI

Usage:
  node risk-scoring-engine.js export [inputConfig] [outputPath]  - Export config to file
  node risk-scoring-engine.js test                               - Test with sample transaction
  node risk-scoring-engine.js summary                            - Show profile summaries

Examples:
  node risk-scoring-engine.js test
  node risk-scoring-engine.js summary
  node risk-scoring-engine.js export null ../config/risk-config.json
    `);
  }
}

module.exports = RiskScoringEngine;

// Nicolas Larenas, nlarchive
