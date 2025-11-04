const axios = require('axios');
const logger = require('../config/logger');
const MinIOWrapper = require('../plugins/minio-wrapper');
const PathwayWrapper = require('../plugins/pathway-wrapper');
const PostgresWrapper = require('../plugins/postgres-wrapper');
const NatsWrapper = require('../plugins/nats-wrapper');

/**
 * Step executor - calls plugin actions
 */
class StepExecutor {
  constructor(db) {
    this.db = db;
    this.wrappers = {};
  }

  async getWrapper(pluginId) {
    if (this.wrappers[pluginId]) {
      return this.wrappers[pluginId];
    }

    const plugin = this.db.getPlugin(pluginId);
    if (!plugin) {
      return null;
    }

    const spec = StepExecutor.extractPluginSpec(plugin);
    let WrapperClass;

    switch (pluginId) {
      case 'minio':
        WrapperClass = MinIOWrapper;
        break;
      case 'pathway':
        WrapperClass = PathwayWrapper;
        break;
      case 'postgres':
        WrapperClass = PostgresWrapper;
        break;
      case 'nats':
        WrapperClass = NatsWrapper;
        break;
      default:
        return null;
    }

    try {
      this.wrappers[pluginId] = new WrapperClass(spec);
      await this.wrappers[pluginId].connect();
      return this.wrappers[pluginId];
    } catch (error) {
      logger.error('Failed to create or connect wrapper for plugin', { pluginId, error: error.message });
      return null;
    }
  }

  static extractPluginSpec(plugin) {
    if (!plugin) {
      return {};
    }

    if (plugin.spec && plugin.spec.spec) {
      return plugin.spec.spec;
    }

    return plugin.spec || {};
  }

  /**
   * Execute a single workflow step
   * @param {Object} step - Step specification
   * @param {Object} context - Execution context with previous step results
   * @returns {Promise<Object>} - Step result
   */
  async execute(step, context = {}) {
    const plugin = this.db.getPlugin(step.plugin);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${step.plugin}`);
    }

    const pluginSpec = StepExecutor.extractPluginSpec(plugin);

    // Validate action is exposed (if plugin spec has exposes list)
    if (pluginSpec.exposes && Array.isArray(pluginSpec.exposes) && pluginSpec.exposes.length > 0) {
      if (!pluginSpec.exposes.includes(step.action)) {
        throw new Error(`Plugin "${step.plugin}" does not expose action "${step.action}"`);
      }
    }

    // Resolve input with template substitution
    const input = this.resolveInput(step.input || {}, context);

    // Check if we have a wrapper for this plugin
    const wrapper = await this.getWrapper(step.plugin);
    let result;

    if (wrapper) {
      // Call wrapper directly
      logger.info('Executing step via wrapper', { 
        stepId: step.id, 
        plugin: step.plugin, 
        action: step.action
      });

      try {
        result = await wrapper[step.action](input);
        logger.info('Step executed successfully via wrapper', { stepId: step.id });
      } catch (error) {
        logger.error('Step execution failed via wrapper', { 
          stepId: step.id,
          error: error.message
        });
        throw error;
      }
    } else {
      // Build plugin service URL and call via HTTP
      const serviceUrl = this.buildServiceUrl(plugin, step.action);

      logger.info('Executing step via HTTP', { 
        stepId: step.id, 
        plugin: step.plugin, 
        action: step.action,
        url: serviceUrl
      });

      try {
        const response = await this.callPlugin(serviceUrl, input, step);
        
        logger.info('Step executed successfully via HTTP', { 
          stepId: step.id,
          status: response.status 
        });

        result = response.data;
      } catch (error) {
        logger.error('Step execution failed via HTTP', { 
          stepId: step.id,
          error: error.message,
          response: error.response?.data
        });
        throw error;
      }
    }

    return result;
  }

  /**
   * Call plugin HTTP endpoint
   */
  async callPlugin(url, input, step) {
    const timeout = step.timeout || 30000; // 30s default
    const retryConfig = step.retry || {};
    const maxAttempts = retryConfig.maxAttempts || 1;
    const backoff = retryConfig.backoff || 'fixed';

    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await axios.post(url, input, {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Workflow-Step': step.id
          }
        });

        return response;
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts) {
          const delayMs = this.calculateBackoff(attempt, backoff);
          logger.warn('Step attempt failed, retrying', { 
            stepId: step.id,
            attempt,
            maxAttempts,
            delayMs
          });
          await this.sleep(delayMs);
        }
      }
    }

    throw lastError;
  }

  /**
   * Build service URL for plugin action
   */
  buildServiceUrl(plugin, action) {
    const spec = StepExecutor.extractPluginSpec(plugin);
    if (spec.baseUrl) {
      return `${spec.baseUrl}/${action}`;
    }
    const namespace = spec.k8s?.namespace || process.env.KUBE_NAMESPACE || 'plugins';
    const serviceName = (plugin?.id || spec.id || 'plugin').replace(/\./g, '-');
    const port = Array.isArray(spec.ports) && spec.ports.length > 0 ? spec.ports[0] : 8080;

    // Kubernetes service DNS format
    return `http://${serviceName}.${namespace}.svc.cluster.local:${port}/${action}`;
  }

  /**
   * Resolve input with template substitution
   * Supports {{ steps.stepId.result }} syntax
   */
  resolveInput(input, context) {
    const resolved = JSON.parse(JSON.stringify(input)); // Deep clone

    const resolveValue = (value) => {
      if (typeof value === 'string') {
        // Template substitution: {{ steps.fetch.result }}
        const matches = value.match(/\{\{\s*steps\.([a-zA-Z0-9_-]+)\.result\s*\}\}/);
        if (matches) {
          const stepId = matches[1];
          if (context.steps && context.steps[stepId]) {
            return context.steps[stepId].result;
          }
        }
        
        // Template substitution: {{ steps.fetch.result.data }}
        const deepMatches = value.match(/\{\{\s*steps\.([a-zA-Z0-9_-]+)\.result\.(\w+)\s*\}\}/);
        if (deepMatches) {
          const stepId = deepMatches[1];
          const field = deepMatches[2];
          if (context.steps && context.steps[stepId] && context.steps[stepId].result) {
            return context.steps[stepId].result[field];
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        for (const key in value) {
          value[key] = resolveValue(value[key]);
        }
      }
      return value;
    };

    return resolveValue(resolved);
  }

  /**
   * Calculate backoff delay
   */
  calculateBackoff(attempt, strategy) {
    if (strategy === 'exponential') {
      return Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
    }
    return 1000; // Fixed 1s
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = StepExecutor;

// Nicolas Larenas, nlarchive
