#!/usr/bin/env node

/**
 * Test Report Generator
 * 
 * Consumes test-results.json and coverage data to generate comprehensive HTML and optional PDF reports
 * Usage: node generate-test-report.js --input <path> --output <path> [--format html|pdf]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      result[key] = args[i + 1] || true;
      i++;
    }
  }
  return result;
}

/**
 * Read JSON file with error handling
 */
function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Parse coverage data from coverage-final.json
 */
function parseCoverageData(coverageData) {
  const summary = {
    totalFiles: Object.keys(coverageData).length,
    totalStatements: 0,
    coveredStatements: 0,
    totalBranches: 0,
    coveredBranches: 0,
    totalFunctions: 0,
    coveredFunctions: 0,
    totalLines: 0,
    coveredLines: 0,
    files: []
  };

  for (const [filePath, coverage] of Object.entries(coverageData)) {
    const s = coverage.s || {};
    const b = coverage.b || {};
    const f = coverage.f || {};
    const l = coverage.l || {};

    const fileStats = {
      path: filePath,
      statements: {
        total: Object.keys(s).length,
        covered: Object.values(s).filter(v => v > 0).length
      },
      branches: {
        total: Object.keys(b).length,
        covered: Object.values(b).filter(arr => arr.some(v => v > 0)).length
      },
      functions: {
        total: Object.keys(f).length,
        covered: Object.values(f).filter(v => v > 0).length
      },
      lines: {
        total: Object.keys(l).length,
        covered: Object.values(l).filter(v => v > 0).length
      }
    };

    // Calculate percentages
    fileStats.statementsCoverage = fileStats.statements.total > 0 
      ? ((fileStats.statements.covered / fileStats.statements.total) * 100).toFixed(2)
      : 100;
    fileStats.branchCoverage = fileStats.branches.total > 0
      ? ((fileStats.branches.covered / fileStats.branches.total) * 100).toFixed(2)
      : 100;
    fileStats.functionCoverage = fileStats.functions.total > 0
      ? ((fileStats.functions.covered / fileStats.functions.total) * 100).toFixed(2)
      : 100;
    fileStats.lineCoverage = fileStats.lines.total > 0
      ? ((fileStats.lines.covered / fileStats.lines.total) * 100).toFixed(2)
      : 100;

    summary.totalStatements += fileStats.statements.total;
    summary.coveredStatements += fileStats.statements.covered;
    summary.totalBranches += fileStats.branches.total;
    summary.coveredBranches += fileStats.branches.covered;
    summary.totalFunctions += fileStats.functions.total;
    summary.coveredFunctions += fileStats.functions.covered;
    summary.totalLines += fileStats.lines.total;
    summary.coveredLines += fileStats.lines.covered;

    summary.files.push(fileStats);
  }

  // Calculate overall percentages
  summary.statementsCoverage = summary.totalStatements > 0
    ? ((summary.coveredStatements / summary.totalStatements) * 100).toFixed(2)
    : 100;
  summary.branchCoverage = summary.totalBranches > 0
    ? ((summary.coveredBranches / summary.totalBranches) * 100).toFixed(2)
    : 100;
  summary.functionCoverage = summary.totalFunctions > 0
    ? ((summary.coveredFunctions / summary.totalFunctions) * 100).toFixed(2)
    : 100;
  summary.lineCoverage = summary.totalLines > 0
    ? ((summary.coveredLines / summary.totalLines) * 100).toFixed(2)
    : 100;

  // Sort files by coverage (lowest first)
  summary.files.sort((a, b) => parseFloat(a.statementsCoverage) - parseFloat(b.statementsCoverage));

  return summary;
}

/**
 * Generate HTML report
 */
function generateHTMLReport(testResults, coverageSummary, timestamp) {
  const passRate = ((testResults.numPassedTests / testResults.numTotalTests) * 100).toFixed(2);
  const duration = testResults.endTime - testResults.startTime;
  const startDate = new Date(testResults.startTime).toISOString();

  // Coverage color helper
  const getCoverageColor = (percentage) => {
    const p = parseFloat(percentage);
    if (p >= 90) return '#28a745';
    if (p >= 80) return '#ffc107';
    if (p >= 70) return '#fd7e14';
    return '#dc3545';
  };

  // Build test suites details
  let testSuitesHTML = '';
  if (testResults.testResults && testResults.testResults.length > 0) {
    const testSuite = testResults.testResults[0];
    testSuitesHTML = `
      <div class="test-suite">
        <h3>${path.basename(testSuite.name)}</h3>
        <div class="suite-stats">
          <span>Status: <strong>${testSuite.status === 'passed' ? '✓ Passed' : '✗ Failed'}</strong></span>
          <span>Tests: <strong>${testSuite.assertionResults.length}</strong></span>
        </div>
        <div class="test-cases">
          ${testSuite.assertionResults.map((test, idx) => `
            <div class="test-case ${test.status}">
              <div class="test-title">
                <span class="status-icon">${test.status === 'passed' ? '✓' : '✗'}</span>
                <span>${test.title}</span>
                <span class="duration">${test.duration}ms</span>
              </div>
              ${test.ancestorTitles.length > 0 ? `<div class="test-path">${test.ancestorTitles.join(' › ')}</div>` : ''}
              ${test.failureMessages.length > 0 ? `<div class="test-error">${test.failureMessages.join('<br>')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Build coverage table
  const coverageTableHTML = `
    <table class="coverage-table">
      <thead>
        <tr>
          <th>File</th>
          <th style="text-align: center;">Statements</th>
          <th style="text-align: center;">Branches</th>
          <th style="text-align: center;">Functions</th>
          <th style="text-align: center;">Lines</th>
        </tr>
      </thead>
      <tbody>
        ${coverageSummary.files.slice(0, 20).map(file => `
          <tr>
            <td class="file-path"><code>${file.path.replace(/\\/g, '/').split('/').slice(-1)[0]}</code></td>
            <td style="text-align: center;"><span class="coverage-badge" style="background-color: ${getCoverageColor(file.statementsCoverage)}">${file.statementsCoverage}%</span></td>
            <td style="text-align: center;"><span class="coverage-badge" style="background-color: ${getCoverageColor(file.branchCoverage)}">${file.branchCoverage}%</span></td>
            <td style="text-align: center;"><span class="coverage-badge" style="background-color: ${getCoverageColor(file.functionCoverage)}">${file.functionCoverage}%</span></td>
            <td style="text-align: center;"><span class="coverage-badge" style="background-color: ${getCoverageColor(file.lineCoverage)}">${file.lineCoverage}%</span></td>
          </tr>
        `).join('')}
        ${coverageSummary.files.length > 20 ? `
          <tr class="more-files">
            <td colspan="5">... and ${coverageSummary.files.length - 20} more files</td>
          </tr>
        ` : ''}
      </tbody>
    </table>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report - Fraud Detection System</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    
    header p {
      font-size: 0.95em;
      opacity: 0.9;
    }
    
    .report-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .meta-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      border-left: 4px solid #667eea;
    }
    
    .meta-card h3 {
      font-size: 0.9em;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    
    .meta-card .value {
      font-size: 1.8em;
      font-weight: bold;
      color: #333;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .summary-card {
      background: white;
      padding: 25px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .summary-card h2 {
      margin-bottom: 15px;
      font-size: 1.3em;
      color: #333;
    }
    
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    
    .stat-row:last-child {
      border-bottom: none;
    }
    
    .stat-label {
      color: #666;
    }
    
    .stat-value {
      font-weight: bold;
      color: #333;
    }
    
    .stat-value.passed {
      color: #28a745;
    }
    
    .stat-value.failed {
      color: #dc3545;
    }
    
    .coverage-overview {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .coverage-metric {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
      text-align: center;
      border: 1px solid #eee;
    }
    
    .coverage-metric label {
      display: block;
      font-size: 0.85em;
      color: #666;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    
    .coverage-metric .percentage {
      font-size: 2em;
      font-weight: bold;
      color: #667eea;
    }
    
    section {
      background: white;
      padding: 25px;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    section h2 {
      margin-bottom: 20px;
      font-size: 1.5em;
      color: #333;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }
    
    .test-suite {
      margin-bottom: 20px;
    }
    
    .test-suite h3 {
      margin-bottom: 10px;
      color: #444;
    }
    
    .suite-stats {
      display: flex;
      gap: 20px;
      margin-bottom: 15px;
      font-size: 0.9em;
      color: #666;
    }
    
    .test-cases {
      border-left: 3px solid #e0e0e0;
      padding-left: 15px;
    }
    
    .test-case {
      margin-bottom: 12px;
      padding: 10px;
      border-radius: 4px;
      background: #f9f9f9;
    }
    
    .test-case.passed {
      border-left: 3px solid #28a745;
    }
    
    .test-case.failed {
      border-left: 3px solid #dc3545;
    }
    
    .test-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 500;
    }
    
    .status-icon {
      font-size: 1.2em;
      font-weight: bold;
    }
    
    .test-case.passed .status-icon {
      color: #28a745;
    }
    
    .test-case.failed .status-icon {
      color: #dc3545;
    }
    
    .duration {
      margin-left: auto;
      font-size: 0.85em;
      color: #999;
      font-weight: normal;
    }
    
    .test-path {
      font-size: 0.85em;
      color: #999;
      margin-top: 5px;
      padding-left: 25px;
    }
    
    .test-error {
      font-size: 0.85em;
      color: #dc3545;
      margin-top: 5px;
      padding: 8px;
      background: #fff5f5;
      border-radius: 3px;
      padding-left: 25px;
    }
    
    .coverage-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    
    .coverage-table thead {
      background: #f5f5f5;
    }
    
    .coverage-table th,
    .coverage-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    
    .coverage-table th {
      font-weight: 600;
      color: #333;
    }
    
    .coverage-table tbody tr:hover {
      background: #f9f9f9;
    }
    
    .file-path code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    
    .coverage-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 3px;
      color: white;
      font-weight: 600;
      font-size: 0.9em;
    }
    
    .more-files {
      background: #f9f9f9;
      text-align: center;
      color: #999;
    }
    
    footer {
      text-align: center;
      color: #999;
      font-size: 0.9em;
      padding-top: 20px;
      border-top: 1px solid #eee;
    }
    
    @media print {
      body {
        background: white;
      }
      
      section, .summary-card, .meta-card {
        box-shadow: none;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Test Report</h1>
      <p>Fraud Detection System - Phase Report</p>
    </header>
    
    <div class="report-meta">
      <div class="meta-card">
        <h3>Report Generated</h3>
        <div class="value">${new Date().toLocaleDateString()}</div>
      </div>
      <div class="meta-card">
        <h3>Test Started</h3>
        <div class="value">${startDate}</div>
      </div>
      <div class="meta-card">
        <h3>Total Duration</h3>
        <div class="value">${(duration / 1000).toFixed(2)}s</div>
      </div>
      <div class="meta-card">
        <h3>Pass Rate</h3>
        <div class="value">${passRate}%</div>
      </div>
    </div>
    
    <div class="summary-grid">
      <div class="summary-card">
        <h2>Test Summary</h2>
        <div class="stat-row">
          <span class="stat-label">Total Tests</span>
          <span class="stat-value">${testResults.numTotalTests}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Passed</span>
          <span class="stat-value passed">${testResults.numPassedTests}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Failed</span>
          <span class="stat-value failed">${testResults.numFailedTests}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Pending</span>
          <span class="stat-value">${testResults.numPendingTests}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Pass Rate</span>
          <span class="stat-value passed">${passRate}%</span>
        </div>
      </div>
      
      <div class="summary-card">
        <h2>Code Coverage</h2>
        <div class="coverage-overview">
          <div class="coverage-metric">
            <label>Statements</label>
            <div class="percentage" style="color: ${getCoverageColor(coverageSummary.statementsCoverage)}">${coverageSummary.statementsCoverage}%</div>
          </div>
          <div class="coverage-metric">
            <label>Branches</label>
            <div class="percentage" style="color: ${getCoverageColor(coverageSummary.branchCoverage)}">${coverageSummary.branchCoverage}%</div>
          </div>
          <div class="coverage-metric">
            <label>Functions</label>
            <div class="percentage" style="color: ${getCoverageColor(coverageSummary.functionCoverage)}">${coverageSummary.functionCoverage}%</div>
          </div>
          <div class="coverage-metric">
            <label>Lines</label>
            <div class="percentage" style="color: ${getCoverageColor(coverageSummary.lineCoverage)}">${coverageSummary.lineCoverage}%</div>
          </div>
        </div>
        <div class="stat-row">
          <span class="stat-label">Files Analyzed</span>
          <span class="stat-value">${coverageSummary.totalFiles}</span>
        </div>
      </div>
      
      <div class="summary-card">
        <h2>Test Suites</h2>
        <div class="stat-row">
          <span class="stat-label">Total Suites</span>
          <span class="stat-value">${testResults.numTotalTestSuites}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Passed Suites</span>
          <span class="stat-value passed">${testResults.numPassedTestSuites}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Failed Suites</span>
          <span class="stat-value failed">${testResults.numFailedTestSuites}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Pending Suites</span>
          <span class="stat-value">${testResults.numPendingTestSuites}</span>
        </div>
      </div>
    </div>
    
    <section>
      <h2>Test Results</h2>
      ${testSuitesHTML}
    </section>
    
    <section>
      <h2>Coverage Details</h2>
      <p style="margin-bottom: 15px; color: #666;">Top files by coverage (sorted by lowest coverage first):</p>
      ${coverageTableHTML}
    </section>
    
    <footer>
      <p>Generated on ${new Date().toISOString()}</p>
      <p>Fraud Detection System - Automated Test Report</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Convert HTML to PDF using Puppeteer
 */
async function convertHTMLToPDF(htmlContent, outputPath) {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    await browser.close();
    console.log(`✓ PDF report generated: ${outputPath}`);
  } catch (error) {
    console.error('Error generating PDF:', error.message);
    console.log('Note: PDF generation requires puppeteer. Install with: npm install puppeteer');
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  // Default paths
  const basePath = args.input || path.join(__dirname, '..');
  const outputDir = args.output || path.join(__dirname, '..', 'reports');
  const format = args.format || 'html';
  
  const testResultsPath = path.join(basePath, 'test-results.json');
  const coverageDataPath = path.join(basePath, '..', '..', 'coverage', 'coverage-final.json');
  
  console.log('📊 Generating Test Report...');
  console.log(`   Test Results: ${testResultsPath}`);
  console.log(`   Coverage Data: ${coverageDataPath}`);
  console.log(`   Output Format: ${format}`);
  
  // Read test results
  if (!fs.existsSync(testResultsPath)) {
    console.error(`✗ Test results file not found: ${testResultsPath}`);
    process.exit(1);
  }
  const testResults = readJSON(testResultsPath);
  
  // Read coverage data
  let coverageData = {};
  if (fs.existsSync(coverageDataPath)) {
    coverageData = readJSON(coverageDataPath);
  } else {
    console.warn(`⚠ Coverage data not found: ${coverageDataPath}`);
  }
  
  // Parse coverage
  const coverageSummary = parseCoverageData(coverageData);
  
  // Generate timestamp for filename
  const timestamp = new Date().toISOString().split('T')[0];
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate HTML
  const htmlContent = generateHTMLReport(testResults, coverageSummary, timestamp);
  const htmlOutputPath = path.join(outputDir, `test-report-${timestamp}.html`);
  fs.writeFileSync(htmlOutputPath, htmlContent, 'utf8');
  console.log(`✓ HTML report generated: ${htmlOutputPath}`);
  
  // Generate PDF if requested
  if (format === 'pdf' || format === 'both') {
    try {
      const pdfOutputPath = path.join(outputDir, `test-report-${timestamp}.pdf`);
      await convertHTMLToPDF(htmlContent, pdfOutputPath);
    } catch (error) {
      if (format === 'pdf') {
        process.exit(1);
      }
    }
  }
  
  // Display summary
  console.log('\n📈 Report Summary:');
  console.log(`   Total Tests: ${testResults.numTotalTests}`);
  console.log(`   Passed: ${testResults.numPassedTests}`);
  console.log(`   Failed: ${testResults.numFailedTests}`);
  console.log(`   Pass Rate: ${((testResults.numPassedTests / testResults.numTotalTests) * 100).toFixed(2)}%`);
  console.log(`   Coverage: Statements ${coverageSummary.statementsCoverage}%, Lines ${coverageSummary.lineCoverage}%`);
  
  console.log('\n✅ Report generation complete!');
}

// Run main function
main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

module.exports = { generateHTMLReport, parseCoverageData, convertHTMLToPDF };

// Nicolas Larenas, nlarchive
