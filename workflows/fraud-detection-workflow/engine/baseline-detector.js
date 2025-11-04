#!/usr/bin/env node

/**
 * Baseline Fraud Detector
 *
 * Reads a transactions CSV and computes a simple risk score using heuristic rules.
 * Writes an augmented CSV with predicted_proba, predicted_label, risk_score and factors.
 *
 * Usage:
 *   node baseline-detector.js --in ../outputs/samples/transactions_synth.csv --out ../outputs/samples/predictions_baseline.csv --threshold 0.5
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
  const input = get('--in', path.resolve(__dirname, '../outputs/samples/transactions_synth.csv'));
  const out = get('--out', path.resolve(__dirname, '../outputs/samples/predictions_baseline.csv'));
  const threshold = parseFloat(get('--threshold', '0.5'));
  return { input, out, threshold };
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

// Enhanced scoring with configurable weights and more sophisticated rules
const DEFAULT_WEIGHTS = {
  amount_spike: 30,
  amount_extreme: 40,
  foreign_country: 25,
  high_velocity: 20,
  extreme_velocity: 35,
  far_from_home: 15,
  very_far_from_home: 25,
  night_activity: 10,
  web_channel: 5,
  device_change: 20,
  merchant_velocity: 15,
  round_amount: 8
};

function scoreRow(row, weights = DEFAULT_WEIGHTS) {
  // row: object with fields as strings; convert to numbers where needed
  const amount = parseFloat(row.amount) || 0;
  const isForeign = parseInt(row.is_foreign, 10) === 1;
  const prev1h = parseInt(row.previous_txn_count_1h, 10) || 0;
  const distKm = parseFloat(row.distance_from_home_km) || 0;
  const hour = parseInt(row.hour, 10) || 0;
  const channel = row.channel || 'web';
  const avg7d = parseFloat(row.avg_amount_7d) || 60;

  let score = 0;
  const factors = [];
  const contributions = {};

  // Amount profiling
  if (amount > 1000) { 
    const w = weights.amount_spike;
    score += w; 
    factors.push('amt>1k'); 
    contributions['amount_spike'] = w;
  }
  if (amount > 5000) { 
    const w = weights.amount_extreme;
    score += w; 
    factors.push('amt>5k'); 
    contributions['amount_extreme'] = w;
  }
  // Deviation from average
  if (avg7d > 0 && amount > avg7d * 3) {
    const w = 15;
    score += w;
    factors.push('amt-3x-avg');
    contributions['amount_deviation'] = w;
  }
  // Round amounts (potential card testing)
  if (amount % 100 === 0 && amount >= 100) {
    const w = weights.round_amount;
    score += w;
    factors.push('round-amt');
    contributions['round_amount'] = w;
  }

  // Geographic analysis
  if (isForeign) { 
    const w = weights.foreign_country;
    score += w; 
    factors.push('foreign'); 
    contributions['foreign_country'] = w;
  }
  if (distKm > 1000) { 
    const w = weights.far_from_home;
    score += w; 
    factors.push('far-from-home'); 
    contributions['far_from_home'] = w;
  }
  if (distKm > 5000) {
    const w = weights.very_far_from_home;
    score += w;
    factors.push('very-far');
    contributions['very_far_from_home'] = w;
  }

  // Velocity checking
  if (prev1h > 5) { 
    const w = weights.high_velocity;
    score += w; 
    factors.push('high-velocity'); 
    contributions['high_velocity'] = w;
  }
  if (prev1h > 10) {
    const w = weights.extreme_velocity;
    score += w;
    factors.push('extreme-velocity');
    contributions['extreme_velocity'] = w;
  }

  // Behavioral patterns
  if (hour >= 0 && hour <= 5) { 
    const w = weights.night_activity;
    score += w; 
    factors.push('night'); 
    contributions['night_activity'] = w;
  }
  if (channel === 'web') { 
    const w = weights.web_channel;
    score += w; 
    factors.push('web'); 
    contributions['web_channel'] = w;
  }

  // Device fingerprinting (placeholder - would use device_id changes)
  // In real system, track device_id per customer
  const deviceId = row.device_id || '';
  if (deviceId.startsWith('D9')) { // synthetic marker for "new device"
    const w = weights.device_change;
    score += w;
    factors.push('new-device');
    contributions['device_change'] = w;
  }

  // Merchant velocity (placeholder - would aggregate by merchant)
  const merchantId = row.merchant_id || '';
  if (merchantId.startsWith('M1')) { // synthetic high-risk merchant
    const w = weights.merchant_velocity;
    score += w;
    factors.push('risky-merchant');
    contributions['merchant_velocity'] = w;
  }

  // Normalize to 0..1 via sigmoid around 50
  const proba = sigmoid((score - 50) / 12);
  return { score, proba, factors: factors.join('|'), contributions };
}

async function main() {
  const { input, out, threshold } = parseArgs();
  ensureDir(out);

  if (!fs.existsSync(input)) {
    console.error(`❌ Input not found: ${input}`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  const ws = fs.createWriteStream(out, { encoding: 'utf8' });
  let headers = [];
  let lineNo = 0;

  for await (const line of rl) {
    if (lineNo === 0) {
      headers = line.split(',');
      const extra = ['risk_score','predicted_proba','predicted_label','risk_factors','risk_contributions'];
      ws.write(headers.concat(extra).join(',') + '\n');
      lineNo++;
      continue;
    }
    if (!line.trim()) { lineNo++; continue; }
    const values = line.split(',');
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    const { score, proba, factors, contributions } = scoreRow(row);
    const pred = proba >= threshold ? 1 : 0;
    const contribStr = JSON.stringify(contributions).replace(/,/g, ';'); // escape commas for CSV
    const outValues = values.concat([score.toFixed(2), proba.toFixed(6), pred, factors, contribStr]);
    ws.write(outValues.join(',') + '\n');
    lineNo++;
  }

  ws.end(() => {
    console.log(`✅ Baseline predictions written: ${out}`);
  });
}

main();

// Nicolas Larenas, nlarchive
