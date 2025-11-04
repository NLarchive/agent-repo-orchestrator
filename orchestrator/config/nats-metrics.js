/**
 * NATS Metrics Module
 * 
 * Connects to NATS and exports metrics about:
 * - Server info (uptime, connections, subscriptions)
 * - Connection stats
 * - Message throughput
 */

const promClient = require('prom-client');
const net = require('net');

// NATS metrics
const natsConnections = new promClient.Gauge({
  name: 'nats_connections_total',
  help: 'Total number of NATS connections',
});

const natsMessages = new promClient.Counter({
  name: 'nats_messages_total',
  help: 'Total messages published/subscribed via NATS',
  labelNames: ['type'], // 'published' or 'received'
});

const natsBytes = new promClient.Counter({
  name: 'nats_bytes_total',
  help: 'Total bytes through NATS',
  labelNames: ['type'], // 'sent' or 'received'
});

const natsSubscriptions = new promClient.Gauge({
  name: 'nats_subscriptions_total',
  help: 'Total subscriptions on NATS',
});

const natsServerUptime = new promClient.Gauge({
  name: 'nats_server_uptime_seconds',
  help: 'NATS server uptime in seconds',
});

const natsConnectionsActive = new promClient.Gauge({
  name: 'nats_connections_active',
  help: 'Currently active NATS connections',
});

let natsClient = null;
let healthCheckInterval = null;

/**
 * Initialize NATS metrics collector
 * Connects to NATS server and starts collecting stats via VARZ endpoint
 */
async function initNatsMetrics(natsUrl = 'nats://localhost:4222') {
  try {
    const url = new URL(natsUrl);
    const host = url.hostname;
    const port = parseInt(url.port) || 4222;
    
    // Query NATS monitoring endpoint
    healthCheckInterval = setInterval(async () => {
      try {
        await queryNatsStats(host, port);
      } catch (err) {
        // Silently fail if NATS unavailable - don't crash orchestrator
        // console.warn('[NatsMetrics] Stats query failed:', err.message);
      }
    }, 5000); // Update every 5 seconds
    
    return true;
  } catch (err) {
    console.error('[NatsMetrics] Failed to init:', err.message);
    return false;
  }
}

/**
 * Query NATS monitoring endpoint for varz stats
 * NATS exposes /varz endpoint on port 8222 with JSON stats
 */
async function queryNatsStats(host, port) {
  return new Promise((resolve, reject) => {
    const monitorPort = 8222; // NATS monitoring port
    
    const req = net.createConnection({ host, port: monitorPort }, () => {
      req.write('GET /varz HTTP/1.1\r\nHost: localhost\r\n\r\n');
    });
    
    req.on('data', (data) => {
      try {
        const response = data.toString();
        const jsonStart = response.indexOf('{');
        if (jsonStart === -1) {
          return;
        }
        
        const stats = JSON.parse(response.substring(jsonStart));
        
        // Update metrics from VARZ stats
        if (stats.connections !== undefined) {
          natsConnectionsActive.set(stats.connections);
        }
        if (stats.total_connections !== undefined) {
          natsConnections.inc(Math.max(0, stats.total_connections - (natsConnections._value || 0)));
        }
        if (stats.subscriptions !== undefined) {
          natsSubscriptions.set(stats.subscriptions);
        }
        if (stats.uptime !== undefined) {
          // Parse uptime like "72h1m23s"
          const uptimeSeconds = parseNatsUptime(stats.uptime);
          natsServerUptime.set(uptimeSeconds);
        }
        if (stats.out_msgs !== undefined) {
          natsMessages.labels('published').inc(Math.max(0, stats.out_msgs - (natsMessages._value || 0)));
        }
        if (stats.in_msgs !== undefined) {
          natsMessages.labels('received').inc(Math.max(0, stats.in_msgs - (natsMessages._value || 0)));
        }
        if (stats.out_bytes !== undefined) {
          natsBytes.labels('sent').inc(Math.max(0, stats.out_bytes - (natsBytes._value || 0)));
        }
        if (stats.in_bytes !== undefined) {
          natsBytes.labels('received').inc(Math.max(0, stats.in_bytes - (natsBytes._value || 0)));
        }
        
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        req.end();
      }
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('NATS monitoring request timeout'));
    });
  });
}

/**
 * Parse NATS uptime format like "72h1m23s" to seconds
 */
function parseNatsUptime(uptimeStr) {
  if (!uptimeStr) return 0;
  
  let seconds = 0;
  const matches = uptimeStr.match(/(\d+)([hms])/g);
  
  if (matches) {
    matches.forEach(match => {
      const num = parseInt(match);
      const unit = match.slice(-1);
      
      switch (unit) {
        case 'h':
          seconds += num * 3600;
          break;
        case 'm':
          seconds += num * 60;
          break;
        case 's':
          seconds += num;
          break;
      }
    });
  }
  
  return seconds;
}

/**
 * Cleanup and stop metrics collection
 */
function stopNatsMetrics() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

/**
 * Get all registered metrics
 */
function getMetrics() {
  return {
    natsConnections,
    natsMessages,
    natsBytes,
    natsSubscriptions,
    natsServerUptime,
    natsConnectionsActive,
  };
}

module.exports = {
  initNatsMetrics,
  stopNatsMetrics,
  getMetrics,
  queryNatsStats,
  parseNatsUptime,
};

// Nicolas Larenas, nlarchive
