/**
 * Integration tests for Prometheus monitoring and alerting
 * Tests that Prometheus can scrape metrics and evaluate alert rules
 */

const axios = require('axios');

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';

describe('Prometheus Integration Tests', () => {
  describe('Metrics Scraping', () => {
    it('should scrape orchestrator metrics successfully', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/targets`);
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      
      const orchestratorTarget = response.data.data.activeTargets.find(
        t => t.labels.job === 'orchestrator'
      );
      
      expect(orchestratorTarget).toBeDefined();
      expect(orchestratorTarget.health).toBe('up');
    });

    it('should have NATS metrics target', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/targets`);
      
      const natsTarget = response.data.data.activeTargets.find(
        t => t.labels.job === 'nats'
      );
      
      expect(natsTarget).toBeDefined();
      expect(natsTarget.health).toBe('up');
    });

    it('should have postgres exporter target', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/targets`);
      
      const postgresTarget = response.data.data.activeTargets.find(
        t => t.labels.job === 'postgres'
      );
      
      expect(postgresTarget).toBeDefined();
      expect(postgresTarget.health).toBe('up');
    });
  });

  describe('Metric Availability', () => {
    it('should query transaction throughput metric', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'transaction_throughput_total' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.result.length).toBeGreaterThan(0);
    });

    it('should query NATS subscriptions metric', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'nats_subscriptions_total' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.result.length).toBeGreaterThan(0);
    });

    it('should query NATS uptime metric', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'nats_server_uptime_seconds' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.result.length).toBeGreaterThan(0);
    });

    it('should query current throughput gauge', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'current_throughput' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });

    it('should query batch queue size', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'batch_queue_size' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });

    it('should query fraud detection alerts', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'fraud_detection_alerts_generated_total' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.result.length).toBeGreaterThan(0);
    });
  });

  describe('Alert Rules', () => {
    it('should load alert rules successfully', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules`);
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.groups).toBeDefined();
      expect(response.data.data.groups.length).toBeGreaterThan(0);
    });

    it('should have orchestrator_alerts group', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules`);
      
      const alertGroup = response.data.data.groups.find(
        g => g.name === 'orchestrator_alerts'
      );
      
      expect(alertGroup).toBeDefined();
      expect(alertGroup.rules.length).toBeGreaterThan(0);
    });

    it('should have OrchestratorDown alert rule', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules`);
      
      const alertGroup = response.data.data.groups.find(
        g => g.name === 'orchestrator_alerts'
      );
      
      const orchestratorDownAlert = alertGroup.rules.find(
        r => r.name === 'OrchestratorDown'
      );
      
      expect(orchestratorDownAlert).toBeDefined();
      expect(orchestratorDownAlert.type).toBe('alerting');
      expect(orchestratorDownAlert.labels.severity).toBe('critical');
    });

    it('should have HighErrorRate alert rule', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules`);
      
      const alertGroup = response.data.data.groups.find(
        g => g.name === 'orchestrator_alerts'
      );
      
      const highErrorRateAlert = alertGroup.rules.find(
        r => r.name === 'HighErrorRate'
      );
      
      expect(highErrorRateAlert).toBeDefined();
      expect(highErrorRateAlert.type).toBe('alerting');
    });

    it('should have NATS-specific alerts', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules`);
      
      const alertGroup = response.data.data.groups.find(
        g => g.name === 'orchestrator_alerts'
      );
      
      const natsAlerts = alertGroup.rules.filter(
        r => r.labels && r.labels.component === 'nats'
      );
      
      expect(natsAlerts.length).toBeGreaterThan(0);
    });

    it('should evaluate alert rules without errors', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/rules`);
      
      expect(response.status).toBe(200);
      
      // Check that no rules are in error state
      response.data.data.groups.forEach(group => {
        group.rules.forEach(rule => {
          if (rule.health) {
            expect(rule.health).toBe('ok');
          }
        });
      });
    });
  });

  describe('Query Performance', () => {
    it('should query rate of throughput efficiently', async () => {
      const start = Date.now();
      
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'rate(transaction_throughput_total[5m])' }
      });
      
      const duration = Date.now() - start;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should query histogram quantile efficiently', async () => {
      const start = Date.now();
      
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { 
          query: 'histogram_quantile(0.95, sum(rate(transaction_processing_duration_seconds_bucket[5m])) by (le, type))'
        }
      });
      
      const duration = Date.now() - start;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(2000); // Complex query, allow 2 seconds
    });
  });

  describe('Metric Labels', () => {
    it('should have correct labels on fraud alerts', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'fraud_detection_alerts_generated_total' }
      });
      
      expect(response.status).toBe(200);
      
      if (response.data.data.result.length > 0) {
        const metric = response.data.data.result[0];
        expect(metric.metric).toHaveProperty('alert_type');
        expect(metric.metric).toHaveProperty('severity');
      }
    });

    it('should have correct labels on NATS messages', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
        params: { query: 'nats_messages_total' }
      });
      
      expect(response.status).toBe(200);
      
      if (response.data.data.result.length > 0) {
        const metric = response.data.data.result[0];
        expect(metric.metric).toHaveProperty('type');
        expect(['published', 'received']).toContain(metric.metric.type);
      }
    });
  });

  describe('Orchestrator Health Check', () => {
    it('should return healthy status from orchestrator', async () => {
      try {
        const response = await axios.get(`${ORCHESTRATOR_URL}/api/health`, { timeout: 2000 });
        
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status');
      } catch (err) {
        // Orchestrator might not be running - skip this test
        if (err.code === 'ECONNREFUSED') {
          console.log('Skipping orchestrator health check - service not running');
        } else {
          throw err;
        }
      }
    });

    it('should export metrics at /metrics endpoint', async () => {
      try {
        const response = await axios.get(`${ORCHESTRATOR_URL}/metrics`, { timeout: 2000 });
        
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.data).toContain('nats_subscriptions_total');
        expect(response.data).toContain('transaction_throughput_total');
      } catch (err) {
        // Orchestrator might not be running - skip this test
        if (err.code === 'ECONNREFUSED') {
          console.log('Skipping orchestrator metrics check - service not running');
        } else {
          throw err;
        }
      }
    });
  });

  describe('Alert State Verification', () => {
    it('should query current alert states', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/alerts`);
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.alerts).toBeDefined();
    });

    it('should not have critical alerts firing in healthy system', async () => {
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/alerts`);
      
      const firingCriticalAlerts = response.data.data.alerts.filter(
        alert => alert.state === 'firing' && alert.labels.severity === 'critical'
      );
      
      // In a healthy system, no critical alerts should be firing
      expect(firingCriticalAlerts.length).toBe(0);
    });
  });

  describe('Time Series Queries', () => {
    it('should query time range for throughput', async () => {
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesAgo = now - 300;
      
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: 'transaction_throughput_total',
          start: fiveMinutesAgo,
          end: now,
          step: '15s'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.data.result).toBeDefined();
    });

    it('should query error rate over time', async () => {
      const now = Math.floor(Date.now() / 1000);
      const tenMinutesAgo = now - 600;
      
      const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query_range`, {
        params: {
          query: 'sum(rate(processing_errors_by_module_total[1m]))',
          start: tenMinutesAgo,
          end: now,
          step: '30s'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
    });
  });
});

// Nicolas Larenas, nlarchive
