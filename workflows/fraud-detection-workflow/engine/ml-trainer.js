#!/usr/bin/env node

/**
 * ML Model Trainer (Scaffold)
 * 
 * Trains a simple gradient boosting model for fraud detection.
 * Supports model versioning and A/B evaluation against baseline.
 * 
 * Usage:
 *   node ml-trainer.js --train --in ../outputs/samples/transactions_synth.csv --out ../models/fraud_model_v1.json
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    if (i !== -1 && i + 1 < args.length) return args[i+1];
    return def;
  };
  const train = args.includes('--train');
  const input = get('--in', path.resolve(__dirname, '../outputs/samples/transactions_synth.csv'));
  const out = get('--out', path.resolve(__dirname, '../models/fraud_model_v1.json'));
  const testSplit = parseFloat(get('--test-split', '0.2'));
  return { train, input, out, testSplit };
}

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

/**
 * Extract features from a transaction row
 */
function extractFeatures(row) {
  return [
    parseFloat(row.amount) || 0,
    parseInt(row.is_foreign, 10) || 0,
    parseInt(row.previous_txn_count_1h, 10) || 0,
    parseFloat(row.distance_from_home_km) || 0,
    parseInt(row.hour, 10) || 0,
    row.channel === 'web' ? 1 : 0,
    row.channel === 'mobile' ? 1 : 0,
    parseFloat(row.avg_amount_7d) || 60,
    // Add more derived features as needed
    (parseFloat(row.amount) || 0) / Math.max(1, parseFloat(row.avg_amount_7d) || 60), // amount ratio
    Math.log(1 + (parseFloat(row.distance_from_home_km) || 0)) // log distance
  ];
}

/**
 * Simple decision stump (weak learner for boosting)
 */
class DecisionStump {
  constructor() {
    this.featureIndex = 0;
    this.threshold = 0;
    this.polarity = 1;
    this.alpha = 0;
  }

  fit(X, y, weights) {
    const n = X.length;
    const m = X[0].length;
    let minError = Infinity;

    // Try each feature
    for (let featIdx = 0; featIdx < m; featIdx++) {
      const values = X.map(x => x[featIdx]);
      const uniqueVals = [...new Set(values)].sort((a, b) => a - b);

      // Try thresholds
      for (let i = 0; i < uniqueVals.length - 1; i++) {
        const thresh = (uniqueVals[i] + uniqueVals[i + 1]) / 2;

        // Try both polarities
        for (const pol of [1, -1]) {
          const predictions = X.map(x => (pol * x[featIdx] < pol * thresh) ? -1 : 1);
          const errors = predictions.map((p, idx) => (p !== y[idx] ? weights[idx] : 0));
          const error = errors.reduce((a, b) => a + b, 0);

          if (error < minError) {
            minError = error;
            this.featureIndex = featIdx;
            this.threshold = thresh;
            this.polarity = pol;
          }
        }
      }
    }

    // Compute alpha
    const eps = 1e-10;
    this.alpha = 0.5 * Math.log((1 - minError + eps) / (minError + eps));
  }

  predict(x) {
    return (this.polarity * x[this.featureIndex] < this.polarity * this.threshold) ? -1 : 1;
  }
}

/**
 * AdaBoost Classifier (simple gradient boosting approximation)
 */
class AdaBoostClassifier {
  constructor(nEstimators = 50) {
    this.nEstimators = nEstimators;
    this.stumps = [];
  }

  fit(X, y) {
    const n = X.length;
    let weights = new Array(n).fill(1 / n);

    for (let t = 0; t < this.nEstimators; t++) {
      const stump = new DecisionStump();
      stump.fit(X, y, weights);
      this.stumps.push(stump);

      // Update weights
      const predictions = X.map(x => stump.predict(x));
      const totalError = predictions.reduce((sum, p, i) => sum + (p !== y[i] ? weights[i] : 0), 0);
      const alpha = stump.alpha;

      for (let i = 0; i < n; i++) {
        weights[i] *= Math.exp(alpha * (predictions[i] !== y[i] ? 1 : -1));
      }

      // Normalize
      const sumWeights = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sumWeights);
    }
  }

  predictProba(x) {
    const score = this.stumps.reduce((sum, stump) => sum + stump.alpha * stump.predict(x), 0);
    // Convert to probability via sigmoid
    return 1 / (1 + Math.exp(-score));
  }

  predict(x, threshold = 0.5) {
    return this.predictProba(x) >= threshold ? 1 : 0;
  }

  toJSON() {
    return {
      n_estimators: this.nEstimators,
      stumps: this.stumps.map(s => ({
        feature_index: s.featureIndex,
        threshold: s.threshold,
        polarity: s.polarity,
        alpha: s.alpha
      }))
    };
  }

  static fromJSON(obj) {
    const model = new AdaBoostClassifier(obj.n_estimators);
    model.stumps = obj.stumps.map(s => {
      const stump = new DecisionStump();
      stump.featureIndex = s.feature_index;
      stump.threshold = s.threshold;
      stump.polarity = s.polarity;
      stump.alpha = s.alpha;
      return stump;
    });
    return model;
  }
}

async function loadData(inputPath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  let headers = [];
  const rows = [];
  let lineNo = 0;

  for await (const line of rl) {
    if (lineNo === 0) { headers = line.split(','); lineNo++; continue; }
    if (!line.trim()) { lineNo++; continue; }
    const values = line.split(',');
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    rows.push(row);
    lineNo++;
  }

  return rows;
}

async function main() {
  const { train, input, out, testSplit } = parseArgs();

  if (!train) {
    console.log('Use --train to train a model. Example: node ml-trainer.js --train --in data.csv --out model.json');
    return;
  }

  ensureDir(out);

  console.log(`\n🤖 ML Model Training\n`);
  console.log(`Loading data from ${input}...`);
  const data = await loadData(input);
  console.log(`Loaded ${data.length} transactions`);

  // Train/test split
  const splitIdx = Math.floor(data.length * (1 - testSplit));
  const trainData = data.slice(0, splitIdx);
  const testData = data.slice(splitIdx);

  console.log(`Train: ${trainData.length}, Test: ${testData.length}`);

  // Extract features and labels
  const X_train = trainData.map(extractFeatures);
  const y_train = trainData.map(r => parseInt(r.fraud_label, 10) === 1 ? 1 : -1);

  const X_test = testData.map(extractFeatures);
  const y_test = testData.map(r => parseInt(r.fraud_label, 10) === 1 ? 1 : 0);

  console.log(`Training AdaBoost with 50 estimators...`);
  const model = new AdaBoostClassifier(50);
  model.fit(X_train, y_train);

  console.log(`Evaluating on test set...`);
  const predictions = X_test.map(x => model.predict(x, 0.5));
  const correct = predictions.filter((p, i) => p === y_test[i]).length;
  const accuracy = correct / predictions.length;

  console.log(`Test Accuracy: ${(accuracy * 100).toFixed(2)}%`);

  // Save model
  const modelData = {
    version: '1.0',
    type: 'AdaBoostClassifier',
    trained_at: new Date().toISOString(),
    train_size: trainData.length,
    test_size: testData.length,
    test_accuracy: accuracy,
    model: model.toJSON()
  };

  fs.writeFileSync(out, JSON.stringify(modelData, null, 2), 'utf8');
  console.log(`✅ Model saved to ${out}`);
}

if (require.main === module) {
  main();
}

module.exports = { AdaBoostClassifier, extractFeatures };

// Nicolas Larenas, nlarchive
