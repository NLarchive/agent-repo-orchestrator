const promClient = require('prom-client');

// HTTP Metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.01, 0.1, 0.5, 1, 2, 5, 10]
});

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status']
});

// Workflow Metrics
const workflowExecutions = new promClient.Counter({
  name: 'workflow_executions_total',
  help: 'Total workflow executions',
  labelNames: ['workflow_type', 'status']
});

const workflowDuration = new promClient.Histogram({
  name: 'workflow_duration_seconds',
  help: 'Workflow execution duration',
  labelNames: ['workflow_type'],
  buckets: [0.5, 1, 5, 10, 30, 60, 120]
});

// Batch Processing Metrics
const batchProcessingTotal = new promClient.Counter({
  name: 'batch_processing_total',
  help: 'Total batch processing operations',
  labelNames: ['batch_type', 'status']
});

const batchProcessingDuration = new promClient.Histogram({
  name: 'batch_processing_duration_seconds',
  help: 'Batch processing duration',
  labelNames: ['batch_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300]
});

const batchItemsProcessed = new promClient.Counter({
  name: 'batch_items_processed_total',
  help: 'Total items processed in batches',
  labelNames: ['batch_type', 'status']
});

const batchQueueSize = new promClient.Gauge({
  name: 'batch_queue_size',
  help: 'Current batch queue size',
  labelNames: ['batch_type']
});

const batchErrorRate = new promClient.Gauge({
  name: 'batch_error_rate',
  help: 'Current batch error rate',
  labelNames: ['batch_type']
});

// Transaction / Application level metrics (for dashboard)
const transactionThroughput = new promClient.Counter({
  name: 'transaction_throughput_total',
  help: 'Total transactions processed',
  labelNames: ['type']
});

const transactionProcessingLatency = new promClient.Histogram({
  name: 'transaction_processing_duration_seconds',
  help: 'Transaction processing latency',
  labelNames: ['type'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

const currentThroughput = new promClient.Gauge({
  name: 'current_throughput',
  help: 'Current throughput (transactions per second)'
});

const errorRate = new promClient.Gauge({
  name: 'error_rate',
  help: 'Current error rate (percentage)'
});

const processingErrorsByModule = new promClient.Counter({
  name: 'processing_errors_by_module_total',
  help: 'Processing errors by module',
  labelNames: ['module']
});

const systemHealthStatus = new promClient.Gauge({
  name: 'system_health_status',
  help: 'System overall health status (1=OK,0=DEGRADED, -1=DOWN)'
});

const testPassRate = new promClient.Gauge({
  name: 'test_pass_rate',
  help: 'Latest test pass rate (0-100)'
});

// Alert Metrics
const alertsGenerated = new promClient.Counter({
  name: 'fraud_detection_alerts_generated_total',
  help: 'Total fraud detection alerts generated',
  labelNames: ['alert_type', 'severity']
});

// Transaction Rejection Metrics
const transactionsRejected = new promClient.Counter({
  name: 'fraud_detection_transactions_rejected_total',
  help: 'Total transactions rejected',
  labelNames: ['reason']
});

// Response Trigger Metrics
const responseTriggersExecuted = new promClient.Counter({
  name: 'fraud_detection_response_triggers_executed_total',
  help: 'Total response triggers executed',
  labelNames: ['trigger_type', 'status']
});

// Fraud Detection Metrics
const fraudDetections = new promClient.Counter({
  name: 'fraud_detections_total',
  help: 'Total frauds detected',
  labelNames: ['fraud_type', 'confidence_level']
});

const fraudConfidenceScore = new promClient.Gauge({
  name: 'fraud_confidence_score',
  help: 'Latest fraud detection confidence score',
  labelNames: ['fraud_type']
});

// Database Metrics
const dbConnectionPool = new promClient.Gauge({
  name: 'db_connections_active',
  help: 'Active database connections',
  labelNames: ['database']
});

const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation'],
  buckets: [0.001, 0.01, 0.1, 0.5, 1, 5]
});

const dbQueryTotal = new promClient.Counter({
  name: 'db_queries_total',
  help: 'Total database queries',
  labelNames: ['operation', 'status']
});

// Application Metrics
const appErrors = new promClient.Counter({
  name: 'app_errors_total',
  help: 'Total application errors',
  labelNames: ['component', 'error_type']
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Active client connections',
  labelNames: ['type']
});

const processUptime = new promClient.Gauge({
  name: 'process_uptime_seconds',
  help: 'Process uptime in seconds'
});

// Plugin Metrics
const pluginExecutions = new promClient.Counter({
  name: 'plugin_executions_total',
  help: 'Total plugin executions',
  labelNames: ['plugin_name', 'status']
});

const pluginDuration = new promClient.Histogram({
  name: 'plugin_duration_seconds',
  help: 'Plugin execution duration',
  labelNames: ['plugin_name'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Export all metrics
module.exports = {
  // HTTP
  httpRequestDuration,
  httpRequestTotal,
  // Workflows
  workflowExecutions,
  workflowDuration,
  // Batch Processing
  batchProcessingTotal,
  batchProcessingDuration,
  batchItemsProcessed,
  batchQueueSize,
  batchErrorRate,
  // Transaction / Application
  transactionThroughput,
  transactionProcessingLatency,
  currentThroughput,
  errorRate,
  processingErrorsByModule,
  systemHealthStatus,
  testPassRate,
  // Alerts & Rejections
  alertsGenerated,
  transactionsRejected,
  responseTriggersExecuted,
  // Fraud Detection
  fraudDetections,
  fraudConfidenceScore,
  // Database
  dbConnectionPool,
  dbQueryDuration,
  dbQueryTotal,
  // Application
  appErrors,
  activeConnections,
  processUptime,
  // Plugins
  pluginExecutions,
  pluginDuration
};

// Nicolas Larenas, nlarchive
