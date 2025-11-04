#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const postgres = require('postgres');

// Small utility helpers
function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function downloadFromMinio(key, outDir) {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
    credentials: { accessKeyId: process.env.MINIO_ROOT_USER || 'minioadmin', secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin_password' },
    forcePathStyle: true
  });

  const cmd = new GetObjectCommand({ Bucket: process.env.MINIO_BUCKET || 'orchestrator', Key: key });
  const outPath = path.join(outDir, path.basename(key));
  const res = await client.send(cmd);
  const stream = res.Body;
  mkdirp(outDir);
  const writer = fs.createWriteStream(outPath);
  return new Promise((resolve, reject) => {
    stream.pipe(writer);
    stream.on('error', reject);
    writer.on('finish', () => resolve(outPath));
    writer.on('error', reject);
  });
}

// compute confusion metrics
function metricsAtThreshold(items, threshold) {
  // items: [{id, risk_score, label}] label: 0/1 ground truth
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (const it of items) {
    const pred = (Number(it.risk_score) >= threshold) ? 1 : 0;
    const lab = Number(it.label);
    if (pred === 1 && lab === 1) tp++;
    if (pred === 1 && lab === 0) fp++;
    if (pred === 0 && lab === 0) tn++;
    if (pred === 0 && lab === 1) fn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : 2 * (precision * recall) / (precision + recall);
  const accuracy = (tp + tn) / Math.max(1, (tp + tn + fp + fn));
  return { threshold, tp, tn, fp, fn, precision, recall, f1, accuracy };
}

async function main() {
  const wfArg = process.argv[2] || path.join(__dirname, 'workflow.json');
  const wfPath = path.resolve(process.cwd(), wfArg);
  if (!fs.existsSync(wfPath)) {
    console.error('Workflow file not found:', wfPath);
    process.exit(2);
  }

  // Ensure outputs dir exists for this workflow
  const outputsDir = path.join(__dirname, 'outputs');
  mkdirp(outputsDir);

  // Submit workflow to local orchestrator API
  const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));
  try {
    console.log('Submitting workflow to orchestrator API');
    const res = await axios.post('http://localhost:3000/api/workflows', wf, { timeout: 10000 });
    console.log('Workflow submitted:', res.data);
  } catch (err) {
    console.error('Failed to submit workflow to orchestrator (continuing):', err && err.response ? err.response.data : err.message || err);
  }

  console.log('Waiting 5s for workflow processing...');
  await new Promise(r => setTimeout(r, 5000));

  // Try to download minio outputs that the workflow may have written
  const possibleKeys = [
    'fraud-alerts/alerts.json',
    `outputs/${wf.name || 'real-time-fraud-detection'}/result.json`
  ];

  const createdFiles = [];
  for (const key of possibleKeys) {
    try {
      const saved = await downloadFromMinio(key, outputsDir);
      console.log('Downloaded MinIO artifact to', saved);
      createdFiles.push(path.relative(process.cwd(), saved));
    } catch (err) {
      // ignore missing keys
    }
  }

  // Connect to Postgres and pull recent transactions
  const sql = postgres({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || 'postgres',
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres_password'
  });

  console.log('Querying transactions from Postgres');
  // Fetch recent transactions (last 24 hours) - fallback to all if none
  let rows = await sql`SELECT id, customer_id, amount, risk_score, fraud_flag, location_country, created_at FROM orchestrator.transactions WHERE created_at >= NOW() - INTERVAL '1 day' ORDER BY created_at DESC`;
  if (!rows || rows.length === 0) {
    console.log('No transactions in last 24h, fetching up to 1000 rows for evaluation');
    rows = await sql`SELECT id, customer_id, amount, risk_score, fraud_flag, location_country, created_at FROM orchestrator.transactions ORDER BY created_at DESC LIMIT 1000`;
  }

  // Build items with label: use fraud_flag if any true present, otherwise heuristics
  const anyLabelTrue = rows.some(r => r.fraud_flag === true);
  const items = rows.map(r => ({ id: r.id, customer_id: r.customer_id, risk_score: (r.risk_score === null || r.risk_score === undefined) ? 0.0 : Number(r.risk_score), amount: Number(r.amount), location_country: r.location_country, label: anyLabelTrue ? (r.fraud_flag ? 1 : 0) : (Number(r.amount) >= 2000 || (r.location_country && r.location_country !== 'US') ? 1 : 0) }));

  // If heuristic used and no frauds found, mark top amounts as fraud to have some positives
  if (!anyLabelTrue) {
    const positives = items.filter(i => i.label === 1);
    if (positives.length === 0 && items.length > 0) {
      // mark top 3 amounts as positive as fallback
      items.sort((a, b) => b.amount - a.amount);
      for (let i = 0; i < Math.min(3, items.length); i++) items[i].label = 1;
    }
  }

  // Evaluate thresholds
  const results = [];
  for (let t = 0; t <= 100; t++) {
    const thr = t / 100.0;
    results.push(metricsAtThreshold(items, thr));
  }
  // choose threshold with highest f1 (tie-breaker accuracy)
  results.sort((a, b) => (b.f1 === a.f1) ? (b.accuracy - a.accuracy) : (b.f1 - a.f1));
  const best = results[0];

  const report = {
    generated_at: new Date().toISOString(),
    workflow: wf.name || wfArg,
    transactions_count: items.length,
    any_label_true: anyLabelTrue,
    best_threshold: best.threshold,
    best_metrics: best,
    top_thresholds: results.slice(0, 10)
  };

  // Save report JSON
  const reportPath = path.join(outputsDir, `fraud-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  createdFiles.push(path.relative(process.cwd(), reportPath));

  // Save per-transaction CSV for audit
  const csvPath = path.join(outputsDir, `fraud-transactions-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  const csvHeader = 'id,customer_id,amount,risk_score,location_country,label\n';
  const csvBody = items.map(i => `${i.id},${i.customer_id},${i.amount},${i.risk_score},${i.location_country ?? ''},${i.label}`).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvBody, 'utf8');
  createdFiles.push(path.relative(process.cwd(), csvPath));

  // Save confusion matrix for best threshold
  const cmPath = path.join(outputsDir, `confusion-matrix-thr-${best.threshold}.json`);
  fs.writeFileSync(cmPath, JSON.stringify(best, null, 2), 'utf8');
  createdFiles.push(path.relative(process.cwd(), cmPath));

  // Created files log
  const logPath = path.join(outputsDir, 'created_files.log');
  const logLines = [`Report generated at ${new Date().toISOString()}`, ...createdFiles.map(f => `- ${f}`)];
  fs.writeFileSync(logPath, logLines.join('\n') + '\n', 'utf8');

  console.log('Report and artifacts written to', outputsDir);
  console.log('Files created:');
  createdFiles.forEach(f => console.log('-', f));

  // Clean up postgres connection
  try { await sql.end(); } catch (e) { /* ignore */ }
}

if (require.main === module) {
  main().catch(err => {
    console.error('run-and-report failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

// Nicolas Larenas, nlarchive
