#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node run-sample.js <workflow.json>');
    process.exit(2);
  }

  const file = path.resolve(process.cwd(), arg);
  if (!fs.existsSync(file)) {
    console.error('Workflow file not found:', file);
    process.exit(2);
  }

  const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

  try {
    const res = await axios.post('http://localhost:3000/api/workflows', wf, { timeout: 10000 });
    console.log('Workflow submitted:', res.data);
  } catch (err) {
    if (err.response) {
      console.error('Submission failed:', err.response.status, err.response.data);
    } else {
      console.error('Submission error:', err.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

// Nicolas Larenas, nlarchive
