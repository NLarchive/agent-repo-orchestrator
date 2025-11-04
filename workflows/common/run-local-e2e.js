#!/usr/bin/env node
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
  });
}

async function waitForHttp(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(url, { timeout: 2000 });
      if (res.status >= 200 && res.status < 500) return res;
    } catch (err) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for HTTP ${url}`);
}

async function downloadFromMinio(key, outDir) {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://localhost:9000',
    credentials: { accessKeyId: process.env.MINIO_ROOT_USER || 'minioadmin', secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin_password' },
    forcePathStyle: true
  });

  const cmd = new GetObjectCommand({ Bucket: process.env.MINIO_BUCKET || 'orchestrator', Key: key });
  const outPath = path.join(outDir, path.basename(key));
  const res = await client.send(cmd);
  const stream = res.Body;
  await fs.promises.mkdir(outDir, { recursive: true });
  const writer = fs.createWriteStream(outPath);
  return new Promise((resolve, reject) => {
    stream.pipe(writer);
    stream.on('error', reject);
    writer.on('finish', () => resolve(outPath));
    writer.on('error', reject);
  });
}

async function main() {
  const sampleWorkflow = process.argv[2] || path.join('minio-store-workflow', 'workflow.json');

  console.log('Ensuring supporting services are up via docker compose');
  try {
    await runCommand('docker compose up -d');
  } catch (err) {
    console.warn('docker compose up -d returned an error, continuing if services are already running');
  }

  // Set environment variables to match docker-compose.yml for local orchestrator
  process.env.MINIO_ACCESS_KEY = 'minioadmin';
  process.env.MINIO_SECRET_KEY = 'minioadmin_password';
  process.env.MINIO_HOST = 'localhost';
  process.env.MINIO_PORT = '9000';
  process.env.MINIO_BUCKET = 'orchestrator';
  process.env.POSTGRES_HOST = 'localhost';
  process.env.POSTGRES_PORT = '5432';
  process.env.POSTGRES_DB = 'orchestrator_db';
  process.env.POSTGRES_USER = 'orchestrator_user';
  process.env.POSTGRES_PASSWORD = 'orchestrator_password';
  process.env.NATS_URL = 'nats://localhost:4222';
  process.env.PATHWAY_URL = 'http://localhost:8000';
  process.env.NODE_ENV = 'development';

  // Reset local DB to ensure a clean run (avoid leftover pending executions)
  const dbPath = path.join(__dirname, '../../orchestrator', 'data', 'orchestrator.db');
  if (fs.existsSync(dbPath)) {
    console.log('Removing existing DB at', dbPath);
    try { fs.unlinkSync(dbPath); } catch (e) { console.warn('Could not remove DB file:', e.message); }
  }

  // Start orchestrator in-process
  console.log('Starting orchestrator in-process');
  const Orchestrator = require('../../orchestrator/index.js');
  const orchestrator = new Orchestrator();
  await orchestrator.start();

  console.log('Waiting for API health');
  await waitForHttp('http://localhost:3000/api/health');

  // Register minimal plugins expected by the sample workflow
  console.log('Registering test plugins (pathway, minio, postgres, nats)');
  const plugins = [
    { id: 'pathway', name: 'pathway', image: 'ghcr.io/example/pathway:latest', version: '0.1.0', spec: { id: 'pathway', ports: [8000], baseUrl: 'http://localhost:8000' } },
    { id: 'minio', name: 'minio', image: 'minio/minio:latest', version: 'latest', spec: { id: 'minio', ports: [9000], baseUrl: 'http://localhost:9000' } },
    { id: 'postgres', name: 'postgres', image: 'postgres:latest', version: 'latest', spec: { id: 'postgres', ports: [5432], baseUrl: 'http://localhost:5432' } },
    { id: 'nats', name: 'nats', image: 'nats:latest', version: 'latest', spec: { id: 'nats', ports: [4222], baseUrl: 'nats://localhost:4222' } }
  ];

  for (const p of plugins) {
    try {
      await axios.post('http://localhost:3000/api/plugins', p, { timeout: 5000 });
      console.log('Registered plugin', p.id);
    } catch (err) {
      console.warn('Plugin register may have failed or already exists:', p.id);
      if (err.response) {
        console.error('Response status:', err.response.status);
        console.error('Response data:', err.response.data);
      }
    }
  }

  console.log('Submitting sample workflow:', sampleWorkflow);
  const wf = JSON.parse(fs.readFileSync(sampleWorkflow, 'utf8'));
  const res = await axios.post('http://localhost:3000/api/workflows', wf, { timeout: 10000 });
  console.log('Workflow submitted:', res.data);

  // Wait for processing
  console.log('Waiting 5s for processing...');
  await new Promise(r => setTimeout(r, 5000));

  // Determine workflow name and output directory dynamically
  let workflowName = 'minio-store-workflow'; // default fallback
  let workflowDir = 'minio-store-workflow'; // default fallback

  try {
    // Get the directory containing the workflow file
    workflowDir = path.dirname(sampleWorkflow);
    // Extract workflow name from directory
    const dirParts = workflowDir.split(path.sep).filter(p => p);
    workflowName = dirParts[dirParts.length - 1] || workflowName;
  } catch (err) {
    console.log('Could not parse workflow path, using defaults:', { workflowName, workflowDir });
  }

  const workflowOutputDir = path.join(__dirname, '..', workflowName, 'outputs');

  // Ensure workflow output directory exists
  if (!fs.existsSync(workflowOutputDir)) {
    fs.mkdirSync(workflowOutputDir, { recursive: true });
  }

  console.log(`Using workflow name: ${workflowName}, dir: ${workflowDir}, output dir: ${workflowOutputDir}`);

  // Try to download workflow-specific output (different workflows may have different output keys)
  let outputDownloaded = false;
  const possibleOutputKeys = [
    `outputs/${workflowName}/result.json`,
    'outputs/minio-store-sample/result.json', // fallback for legacy workflows
    `reports/daily-sales-${new Date().toISOString().split('T')[0]}.json` // for sales reports
  ];

  for (const outputKey of possibleOutputKeys) {
    try {
      const saved = await downloadFromMinio(outputKey, workflowOutputDir);
      console.log('Saved workflow result to', saved);
      outputDownloaded = true;
      break;
    } catch (err) {
      console.log(`Output key '${outputKey}' not found, trying next...`);
    }
  }

  if (!outputDownloaded) {
    console.log('No workflow outputs found in MinIO - workflow may not produce downloadable artifacts');
  }

  console.log('Stopping orchestrator');
  // orchestrator.stop() will exit the process as implemented
  await orchestrator.stop();
}

if (require.main === module) {
  main().catch(err => {
    console.error('run-local-e2e failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

// Nicolas Larenas, nlarchive
