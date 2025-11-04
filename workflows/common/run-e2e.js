#!/usr/bin/env node
const { exec } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const WAIT_INTERVAL = 2000;
const WAIT_TIMEOUT = 120000; // 2 minutes per check

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    const p = exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) return reject({ err, stdout, stderr });
      resolve({ stdout, stderr });
    });
    p.stdout && p.stdout.pipe(process.stdout);
    p.stderr && p.stderr.pipe(process.stderr);
  });
}

function waitForPort(host, port, timeoutMs = WAIT_TIMEOUT) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function attempt() {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for ${host}:${port}`));
        setTimeout(attempt, WAIT_INTERVAL);
      });
      socket.once('timeout', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for ${host}:${port}`));
        setTimeout(attempt, WAIT_INTERVAL);
      });
      socket.connect(port, host, () => {
        socket.end();
        resolve();
      });
    })();
  });
}

async function waitForHttp(url, timeoutMs = WAIT_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(url, { timeout: 2000 });
      if (res.status >= 200 && res.status < 500) return res;
    } catch (err) {
      // ignore and retry
    }
    await new Promise(r => setTimeout(r, WAIT_INTERVAL));
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
  const sampleWorkflow = process.argv[2] || 'workflows/sample-workflows/minio-store-workflow.json';

  console.log('Starting end-to-end flow using docker compose');

  // choose docker command
  let composeCmd = 'docker compose';
  try {
    await runCommand('docker compose version');
  } catch (e) {
    try {
      await runCommand('docker-compose version');
      composeCmd = 'docker-compose';
    } catch (err) {
      console.error('Docker Compose not available. Please install Docker and Docker Compose.');
      process.exit(1);
    }
  }

  console.log('Bringing up docker-compose services (detached)');
  try {
    await runCommand(`${composeCmd} up -d`);
  } catch (err) {
    console.error('Failed to run docker compose up -d', err.stderr || err);
    process.exit(1);
  }

  // wait for basic TCP services
  console.log('Waiting for NATS (localhost:4222), Pathway (localhost:8000), MinIO (localhost:9000), Postgres (localhost:5432)');
  await Promise.all([
    waitForPort('127.0.0.1', 4222).catch(e => console.warn('NATS not reachable yet:', e.message)),
    waitForPort('127.0.0.1', 8000).catch(e => console.warn('Pathway not reachable yet:', e.message)),
    waitForPort('127.0.0.1', 9000).catch(e => console.warn('MinIO not reachable yet:', e.message)),
    waitForPort('127.0.0.1', 5432).catch(e => console.warn('Postgres not reachable yet:', e.message))
  ]);

  console.log('Waiting for orchestrator API at http://localhost:3000/api/health');
  try {
    await waitForHttp('http://localhost:3000/api/health');
  } catch (err) {
    console.warn('Orchestrator not reachable yet. It may still be starting inside the container.');
  }

  // Submit workflow using bundled run-sample.js
  console.log('Submitting sample workflow:', sampleWorkflow);
  try {
    await runCommand(`node workflows/run-sample.js ${sampleWorkflow}`);
  } catch (err) {
    console.error('Failed to submit workflow:', err.stderr || err);
    process.exit(1);
  }

  // Wait a bit for processing to complete, then try to fetch result from MinIO
  console.log('Waiting 5s for workflow to be processed...');
  await new Promise(r => setTimeout(r, 5000));

  const outputKey = 'outputs/minio-store-sample/result.json';
  const outDir = path.join(__dirname, 'outputs');
  console.log('Attempting to download result from MinIO key:', outputKey);
  try {
    const saved = await downloadFromMinio(outputKey, outDir);
    console.log('Saved workflow result to', saved);
  } catch (err) {
    console.error('Failed to download result from MinIO:', err.message || err);
    console.log('You can inspect MinIO console at http://localhost:9001 (default credentials in docker-compose.yml)');
    process.exit(1);
  }

  console.log('End-to-end run complete. Outputs saved to', path.join('workflows', 'outputs'));
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('E2E script failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

// Nicolas Larenas, nlarchive
