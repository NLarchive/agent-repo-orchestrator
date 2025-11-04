const express = require('express');
const DatabaseClient = require('./db/client');
const WorkflowEngine = require('./engine/workflow-engine');
const { createRouter } = require('./api/router');
const { loggingMiddleware, errorMiddleware } = require('./api/middleware');
const config = require('./config/env');
const logger = require('./config/logger');
const promClient = require('prom-client');
const metrics = require('./config/metrics');
const streamerManager = require('./streamers/manager');
const natsMetrics = require('./config/nats-metrics');

/**
 * Main orchestrator entry point
 */
class Orchestrator {
  constructor() {
    this.db = null;
    this.engine = null;
    this.app = null;
    this.server = null;
  }

  async start() {
    try {
      logger.info('Starting orchestrator', { 
        env: config.env,
        apiPort: config.api.port 
      });

      // Initialize database
      this.db = new DatabaseClient(config.db.path);
      this.db.connect();
      this.db.initialize();
      logger.info('Database initialized', { path: config.db.path });

      // Initialize workflow engine
      this.engine = new WorkflowEngine(this.db);
      this.engine.start();
      logger.info('Workflow engine started');

      // Initialize streamer system
      const streamerName = process.env.STREAMER || 'mock';
      const streamerConfig = {
        intervalMs: parseInt(process.env.STREAMER_INTERVAL_MS) || 1000,
        batchSize: parseInt(process.env.STREAMER_BATCH_SIZE) || 50,
        // Additional config can be passed via env vars
      };

      try {
        await streamerManager.load(streamerName, streamerConfig);
        
        // Wire streamer events to handle transaction ingestion
        streamerManager.on('data', (tx) => {
          // In a real system, this would pass to the fraud detection pipeline
          logger.debug('Streamer emitted transaction', { tx_id: tx.id, amount: tx.amount });
          // TODO: Integrate with realtime ingestion pipeline when available
        });

        streamerManager.on('error', (err) => {
          logger.error('Streamer error', { error: err.message });
          metrics.appErrors.inc({ source: 'streamer' });
        });

        streamerManager.on('health', (status) => {
          logger.info('Streamer health update', { status: status.status, details: status.details });
        });

        logger.info('Streamer system initialized', { streamer: streamerName });
      } catch (err) {
        logger.warn('Failed to initialize streamer system', { error: err.message, streamer: streamerName });
        // Don't fail startup if streamer initialization fails; continue with other services
      }

      // Initialize NATS metrics collector
      try {
        const natsUrl = process.env.NATS_URL || 'nats://nats:4222';
        await natsMetrics.initNatsMetrics(natsUrl);
        logger.info('NATS metrics collector initialized', { natsUrl });
      } catch (err) {
        logger.warn('Failed to initialize NATS metrics', { error: err.message });
        // Don't fail startup if NATS metrics unavailable
      }

      // Setup Express app
      this.app = express();
      
      // Middleware
      this.app.use(express.json());
      this.app.use(loggingMiddleware);

      // HTTP Metrics middleware
      this.app.use((req, res, next) => {
        const start = Date.now();
        
        res.on('finish', () => {
          const duration = (Date.now() - start) / 1000;
          metrics.httpRequestDuration
            .labels(req.method, req.path, res.statusCode)
            .observe(duration);
          metrics.httpRequestTotal
            .labels(req.method, req.path, res.statusCode)
            .inc();
        });
        
        next();
      });

      // Prometheus metrics endpoint (at root level)
      this.app.get('/metrics', async (req, res) => {
        try {
          res.set('Content-Type', promClient.register.contentType);
          const metrics = await promClient.register.metrics();
          res.end(metrics);
        } catch (err) {
          logger.error('Metrics endpoint error', { error: err.message });
          res.status(500).end(err.message);
        }
      });

      // Routes
      const router = createRouter(this.db, this.engine);
      this.app.use('/api', router);

      // Error handling
      this.app.use(errorMiddleware);

      // Start server
      this.server = this.app.listen(config.api.port, config.api.host, () => {
        logger.info('API server listening', { 
          host: config.api.host,
          port: config.api.port,
          url: `http://${config.api.host}:${config.api.port}`
        });
      });

      // Start streamer if loaded
      try {
        if (streamerManager.isLoaded()) {
          await streamerManager.start();
          logger.info('Streamer started successfully');
        }
      } catch (err) {
        logger.error('Failed to start streamer', { error: err.message });
        // Don't crash the app; continue with other services
      }

      // Track process uptime
      const startTime = Date.now();
      setInterval(() => {
        metrics.processUptime.set((Date.now() - startTime) / 1000);
      }, 5000);

      // Mock metrics generator (enabled with MOCK_METRICS=true)
      if (process.env.MOCK_METRICS === 'true') {
        logger.info('Starting mock metrics generator (MOCK_METRICS=true)');

        // Simple moving generator to simulate live traffic
        let tps = 5;
        let errorPct = 0;
        const modules = ['ingest', 'scoring', 'enrichment', 'export'];

        setInterval(() => {
          // vary throughput and errors
          const jitter = (Math.random() - 0.5) * 2;
          tps = Math.max(0, Math.round(tps + jitter));
          errorPct = Math.max(0, Math.min(20, errorPct + (Math.random() - 0.5) * 2));

          // update gauges
          metrics.currentThroughput.set(tps);
          metrics.errorRate.set(Number(errorPct.toFixed(2)));

          // increment transaction counters and observe histograms
          const transactions = Math.max(1, Math.round(tps));
          for (let i = 0; i < transactions; i++) {
            const start = Date.now();
            // simulate a processing duration between 5ms and 500ms
            const dur = Math.random() * 0.5;
            metrics.transactionThroughput.inc({ type: 'transaction' });
            metrics.transactionProcessingLatency.observe({ type: 'transaction' }, dur);
          }

          // processing errors per module
          modules.forEach((m) => {
            if (Math.random() < errorPct / 200) {
              metrics.processingErrorsByModule.inc({ module: m });
            }
          });

          // batch queue and batch processing duration
          const queueSize = Math.max(0, Math.round(Math.random() * 20));
          metrics.batchQueueSize.set({ batch_type: 'default' }, queueSize);
          const batchDur = Math.random() * 60;
          metrics.batchProcessingDuration.observe({ batch_type: 'default' }, batchDur);
          if (Math.random() < 0.05) {
            metrics.batchProcessingTotal.inc({ batch_type: 'default', status: 'success' });
            metrics.batchItemsProcessed.inc({ batch_type: 'default', status: 'success' }, Math.round(Math.random() * 1000));
          }

          // system health and test pass rate
          metrics.systemHealthStatus.set(1);
          metrics.testPassRate.set(100 - Math.round(errorPct));

          // alerts generated (simulate fraud detection alerts)
          const alertTypes = ['high_risk_transaction', 'velocity_check', 'suspicious_location', 'amount_anomaly', 'behavioral_pattern'];
          const severities = ['low', 'medium', 'high', 'critical'];
          if (Math.random() < 0.3) { // 30% chance of generating alerts each cycle
            const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
            const severity = severities[Math.floor(Math.random() * severities.length)];
            metrics.alertsGenerated.inc({ alert_type: alertType, severity: severity });
          }

          // transactions rejected (simulate rejection scenarios)
          const rejectionReasons = ['fraud_score_high', 'blacklist', 'velocity_exceeded', 'amount_limit', 'country_restricted'];
          if (Math.random() < 0.1) { // 10% chance of rejections
            const reason = rejectionReasons[Math.floor(Math.random() * rejectionReasons.length)];
            metrics.transactionsRejected.inc({ reason: reason });
          }

          // response triggers executed (simulate automated responses)
          const triggerTypes = ['block_account', 'require_verification', 'notify_customer', 'flag_for_review', 'limit_amount'];
          const triggerStatuses = ['success', 'failed', 'pending'];
          if (Math.random() < 0.2) { // 20% chance of triggers
            const triggerType = triggerTypes[Math.floor(Math.random() * triggerTypes.length)];
            const status = triggerStatuses[Math.floor(Math.random() * triggerStatuses.length)];
            metrics.responseTriggersExecuted.inc({ trigger_type: triggerType, status: status });
          }

        }, 2000); // every 2s
      }

      // Handle server errors
      this.server.on('error', (error) => {
        logger.error('Server error', { error: error.message });
        process.exit(1);
      });

      // Graceful shutdown handlers
      const gracefulShutdown = async (signal) => {
        logger.info(`Received ${signal}, starting graceful shutdown`);
        await this.stop();
      };
      
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      // Handle uncaught exceptions and rejections
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', { error: error.message, stack: error.stack });
        gracefulShutdown('uncaughtException');
      });
      
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection', { reason, promise });
        gracefulShutdown('unhandledRejection');
      });

    } catch (error) {
      logger.error('Failed to start orchestrator', { error: error.message });
      process.exit(1);
    }
  }

  async stop() {
    logger.info('Stopping orchestrator');

    // Stop streamer first
    try {
      if (streamerManager.isLoaded()) {
        await streamerManager.stop();
        logger.info('Streamer stopped');
      }
    } catch (err) {
      logger.error('Error stopping streamer', { error: err.message });
    }

    // Stop NATS metrics collector
    try {
      natsMetrics.stopNatsMetrics();
      logger.info('NATS metrics collector stopped');
    } catch (err) {
      logger.error('Error stopping NATS metrics', { error: err.message });
    }

    // Stop accepting new connections
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }

    // Stop workflow engine (allows current tasks to complete)
    if (this.engine) {
      logger.info('Stopping workflow engine');
      this.engine.stop();
      
      // Give time for current tasks to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Close database connection
    if (this.db) {
      logger.info('Closing database connection');
      this.db.close();
    }

    logger.info('Orchestrator stopped gracefully');
    process.exit(0);
  }
}

// Start if run directly
if (require.main === module) {
  const orchestrator = new Orchestrator();
  orchestrator.start();
}

module.exports = Orchestrator;

// Nicolas Larenas, nlarchive
