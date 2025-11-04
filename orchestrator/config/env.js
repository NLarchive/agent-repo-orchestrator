require('dotenv').config();

const config = {
  // Kubernetes
  kube: {
    configPath: process.env.KUBE_CONFIG_PATH || '~/.kube/config',
    namespace: process.env.KUBE_NAMESPACE || 'plugins',
    context: process.env.KUBE_CONTEXT || 'kind-orchestrator-dev'
  },

  // Database
  db: {
    path: process.env.DB_PATH || './orchestrator/data/orchestrator.db'
  },

  // API
  api: {
    port: parseInt(process.env.API_PORT || '3000', 10),
    host: process.env.API_HOST || '0.0.0.0'
  },

  // Logging
  log: {
    level: process.env.LOG_LEVEL || 'info'
  },

  // Plugins
  plugins: {
    imageRegistry: process.env.PLUGIN_IMAGE_REGISTRY || 'ghcr.io/example',
    portRangeStart: parseInt(process.env.PLUGIN_PORT_RANGE_START || '8080', 10),
    portRangeEnd: parseInt(process.env.PLUGIN_PORT_RANGE_END || '8100', 10)
  },

  // Testing
  test: {
    clusterName: process.env.TEST_CLUSTER_NAME || 'orchestrator-dev',
    timeout: parseInt(process.env.TEST_CLUSTER_TIMEOUT || '60000', 10)
  },

  // Environment
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
};

module.exports = config;

// Nicolas Larenas, nlarchive
