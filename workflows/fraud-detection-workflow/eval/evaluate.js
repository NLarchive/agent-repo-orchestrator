#!/usr/bin/env node

/**
 * Evaluation Pipeline
 *
 * Computes classification metrics from a predictions CSV (with fraud_label, predicted_proba, predicted_label).
 * Writes structured outputs under ../outputs/metrics and ../outputs/reports.
 *
 * Usage:
 *   node evaluate.js --in ../outputs/samples/predictions_baseline.csv --prefix baseline
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
  const input = get('--in', path.resolve(__dirname, '../outputs/samples/predictions_baseline.csv'));
  const prefix = get('--prefix', 'baseline');
  return { input, prefix };
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function aucFromCurve(curve) {
  // curve: array of [x,y] sorted by x asc; trapezoidal
  let auc = 0;
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i-1];
    const [x1, y1] = curve[i];
    auc += (x1 - x0) * (y0 + y1) / 2;
  }
  return auc;
}

async function main() {
  const { input, prefix } = parseArgs();
  if (!fs.existsSync(input)) {
    console.error(`❌ Input not found: ${input}`);
    process.exit(1);
  }

  const metricsDir = path.resolve(__dirname, '../outputs/metrics');
  const reportsDir = path.resolve(__dirname, '../outputs/reports');
  const samplesDir = path.resolve(__dirname, '../outputs/samples');
  ensureDir(metricsDir); ensureDir(reportsDir); ensureDir(samplesDir);

  const rl = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
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
    row.fraud_label = parseInt(row.fraud_label, 10) || 0;
    row.predicted_label = parseInt(row.predicted_label, 10) || 0;
    row.predicted_proba = parseFloat(row.predicted_proba) || 0;
    rows.push(row);
    lineNo++;
  }

  const total = rows.length;
  const pos = rows.filter(r => r.fraud_label === 1).length;
  const neg = total - pos;

  // Confusion matrix
  const tp = rows.filter(r => r.fraud_label === 1 && r.predicted_label === 1).length;
  const tn = rows.filter(r => r.fraud_label === 0 && r.predicted_label === 0).length;
  const fp = rows.filter(r => r.fraud_label === 0 && r.predicted_label === 1).length;
  const fn = rows.filter(r => r.fraud_label === 1 && r.predicted_label === 0).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const tpr = recall;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

  // ROC and PR curves by sweeping thresholds
  const sorted = [...rows].sort((a, b) => b.predicted_proba - a.predicted_proba);
  const thresholds = Array.from({length: 101}, (_, i) => i/100);
  const roc = [];
  const pr = [];
  const thrMetrics = [['threshold','precision','recall','fpr','tpr']];
  for (const thr of thresholds) {
    let TP=0, FP=0, TN=0, FN=0;
    for (const r of sorted) {
      const pred = r.predicted_proba >= thr ? 1 : 0;
      if (pred === 1 && r.fraud_label === 1) TP++;
      else if (pred === 1 && r.fraud_label === 0) FP++;
      else if (pred === 0 && r.fraud_label === 0) TN++;
      else if (pred === 0 && r.fraud_label === 1) FN++;
    }
    const prec = TP+FP>0?TP/(TP+FP):0;
    const rec = TP+FN>0?TP/(TP+FN):0;
    const fpr_ = FP+TN>0?FP/(FP+TN):0;
    roc.push([fpr_, rec]);
    pr.push([rec, prec]);
    thrMetrics.push([thr.toFixed(2), prec.toFixed(6), rec.toFixed(6), fpr_.toFixed(6), rec.toFixed(6)]);
  }
  // Ensure ROC starts at (0,0) and ends at (1,1)
  roc.unshift([0,0]); roc.push([1,1]);
  // Ensure PR starts/ends nicely
  pr.unshift([0, pos/Math.max(1,total)]);

  const aucRoc = aucFromCurve(roc.sort((a,b)=>a[0]-b[0]));
  const aucPr = aucFromCurve(pr.sort((a,b)=>a[0]-b[0]));

  // Top-K metrics
  const ks = [100, 1000];
  const topk = {};
  for (const k of ks) {
    const slice = sorted.slice(0, Math.min(k, sorted.length));
    const kpos = slice.filter(r => r.fraud_label === 1).length;
    topk[`top_${k}_precision`] = slice.length>0? kpos / slice.length : 0;
    topk[`top_${k}_recall`] = pos>0? kpos / pos : 0;
  }

  const summary = {
    total, positives: pos, negatives: neg,
    tp, tn, fp, fn,
    precision, recall, f1, fpr, tpr,
    auc_roc: aucRoc, auc_pr: aucPr,
    ...topk
  };

  // Write outputs
  fs.writeFileSync(path.join(metricsDir, `${prefix}_summary.json`), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(reportsDir, `${prefix}_confusion_matrix.csv`), 'tn,fp\nfn,tp\n' + `${tn},${fp}\n${fn},${tp}\n`);
  fs.writeFileSync(path.join(reportsDir, `${prefix}_classification_report.csv`), 'metric,value\n' + [
    ['precision', precision],
    ['recall', recall],
    ['f1', f1],
    ['auc_roc', aucRoc],
    ['auc_pr', aucPr],
    ['fpr', fpr],
    ['tpr', tpr]
  ].map(([k,v])=>`${k},${v}`).join('\n') + '\n');
  fs.writeFileSync(path.join(reportsDir, `${prefix}_roc_curve.csv`), 'fpr,tpr\n' + roc.map(([x,y])=>`${x},${y}`).join('\n') + '\n');
  fs.writeFileSync(path.join(reportsDir, `${prefix}_pr_curve.csv`), 'recall,precision\n' + pr.map(([x,y])=>`${x},${y}`).join('\n') + '\n');
  fs.writeFileSync(path.join(reportsDir, `${prefix}_threshold_metrics.csv`), thrMetrics.map(r=>r.join(',')).join('\n') + '\n');

  // Save top 500 suspicions
  const top500 = sorted.slice(0, Math.min(500, sorted.length));
  const header = Object.keys(top500[0] || {});
  const topPath = path.join(samplesDir, `${prefix}_top_suspicions.csv`);
  fs.writeFileSync(topPath, header.join(',') + '\n' + top500.map(r => header.map(h => r[h]).join(',')).join('\n') + '\n');

  console.log(`✅ Metrics written to ${metricsDir} and reports to ${reportsDir}`);
}

main();
