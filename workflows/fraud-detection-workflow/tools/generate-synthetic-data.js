#!/usr/bin/env node

/**
 * Synthetic Fraud Transactions Generator
 *
 * Generates a realistic transactions CSV for fraud detection development.
 * Tunable rows and fraud rate. Emits features used by baseline detector.
 *
 * Usage:
 *   node generate-synthetic-data.js --rows 20000 --fraud-rate 0.01 --out ../outputs/samples/transactions_synth.csv
 */

const fs = require('fs');
const path = require('path');

// Simple seeded RNG (Mulberry32)
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function randn(rng, mean = 0, std = 1) {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Geo presets
const COUNTRIES = [
  { code: 'US', lat: 37.6, lon: -95.665, currency: 'USD' },
  { code: 'GB', lat: 54.0, lon: -2.0, currency: 'GBP' },
  { code: 'DE', lat: 51.0, lon: 10.0, currency: 'EUR' },
  { code: 'FR', lat: 46.0, lon: 2.0, currency: 'EUR' },
  { code: 'BR', lat: -10.0, lon: -55.0, currency: 'BRL' },
  { code: 'IN', lat: 20.6, lon: 78.9, currency: 'INR' },
  { code: 'JP', lat: 36.2, lon: 138.2, currency: 'JPY' },
  { code: 'AU', lat: -25.3, lon: 133.8, currency: 'AUD' },
  { code: 'ZA', lat: -30.6, lon: 22.9, currency: 'ZAR' }
];

const CHANNELS = ['web', 'mobile', 'pos'];

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, def) => {
    const i = args.indexOf(flag);
    if (i !== -1 && i + 1 < args.length) return args[i+1];
    return def;
  };
  const rows = parseInt(get('--rows', '20000'), 10);
  const fraudRate = parseFloat(get('--fraud-rate', '0.01'));
  const out = get('--out', path.resolve(__dirname, '../outputs/samples/transactions_synth.csv'));
  const seed = parseInt(get('--seed', '1337'), 10);
  return { rows, fraudRate, out, seed };
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function main() {
  const { rows, fraudRate, out, seed } = parseArgs();
  const rng = mulberry32(seed);
  ensureDir(out);
  const ws = fs.createWriteStream(out, { encoding: 'utf8' });

  const headers = [
    'transaction_id','timestamp','customer_id','merchant_id','amount','currency','country','ip_address','device_id','channel','latitude','longitude','home_latitude','home_longitude','previous_txn_count_1h','avg_amount_7d','is_foreign','distance_from_home_km','hour','fraud_label'
  ];
  ws.write(headers.join(',') + '\n');

  const customers = 5000;
  const merchants = 1200;
  const customerHome = Array.from({length: customers}, (_, i) => {
    const c = choice(rng, COUNTRIES);
    const jitterLat = c.lat + randn(rng, 0, 2.5);
    const jitterLon = c.lon + randn(rng, 0, 3.5);
    return { country: c.code, lat: jitterLat, lon: jitterLon };
  });

  let tsBase = Date.now() - 1000 * 60 * 60 * 24 * 14; // last 14 days
  let globalId = 1;

  for (let i = 0; i < rows; i++) {
    const customerId = Math.floor(rng() * customers);
    const merchantId = Math.floor(rng() * merchants);
    const home = customerHome[customerId];
    const ctry = choice(rng, COUNTRIES);
    const channel = choice(rng, CHANNELS);
    // amount profile: normal with heavy tail
    let amount = Math.max(1, Math.exp(randn(rng, Math.log(60), 0.8)));
    if (rng() < 0.02) amount *= (5 + rng() * 20); // occasional spikes

    const isForeign = ctry.code !== home.country;
    const lat = ctry.lat + randn(rng, 0, 2.0);
    const lon = ctry.lon + randn(rng, 0, 2.0);
    const dist = haversineKm(home.lat, home.lon, lat, lon);
    const prev1h = Math.max(0, Math.round(randn(rng, 1, 1.5)));
    const avg7d = Math.max(5, Math.exp(randn(rng, Math.log(50), 0.6)));
    const hour = Math.floor(rng() * 24);

    // fraud propensity from latent rules
    let pFraud = fraudRate;
    if (amount > 1000) pFraud += 0.02;
    if (amount > 5000) pFraud += 0.05;
    if (isForeign) pFraud += 0.02;
    if (dist > 2000) pFraud += 0.02;
    if (prev1h > 5) pFraud += 0.03;
    if (hour >= 0 && hour <= 5) pFraud += 0.015;
    pFraud = Math.min(0.95, pFraud);
    const fraudLabel = rng() < pFraud ? 1 : 0;

    const row = [
      globalId,
      new Date(tsBase + i * 1000).toISOString(),
      `C${customerId}`,
      `M${merchantId}`,
      amount.toFixed(2),
      ctry.currency,
      ctry.code,
      `192.168.${Math.floor(rng()*255)}.${Math.floor(rng()*255)}`,
      `D${Math.floor(rng()*100000)}`,
      channel,
      lat.toFixed(5),
      lon.toFixed(5),
      home.lat.toFixed(5),
      home.lon.toFixed(5),
      prev1h,
      avg7d.toFixed(2),
      isForeign ? 1 : 0,
      dist.toFixed(2),
      hour,
      fraudLabel
    ];
    ws.write(row.join(',') + '\n');
    globalId++;
  }

  ws.end(() => {
    console.log(`✅ Synthetic dataset written: ${out}`);
  });
}

main();
