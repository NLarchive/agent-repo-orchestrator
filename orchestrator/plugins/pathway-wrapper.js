// orchestrator/plugins/pathway-wrapper.js
// Pathway ETL pipeline plugin wrapper for orchestrator

const axios = require('axios');

class PathwayWrapper {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.PATHWAY_URL || 'http://localhost:8000',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      ...config
    };
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout
    });
  }

  async connect() {
    try {
      const response = await this.client.get('/health');
      console.log('[PATHWAY] Connected to', this.config.baseUrl);
      return true;
    } catch (err) {
      console.error('[PATHWAY] Connection failed:', err.message);
      throw err;
    }
  }

  async disconnect() {
    console.log('[PATHWAY] Disconnected');
  }

  async runPipeline(input) {
    const { pipelineId, input: pipelineInput } = input;
    if (!pipelineId) throw new Error('Pipeline ID is required for runPipeline');
    
    try {
      console.log(`[PATHWAY] Running pipeline ${pipelineId} with input:`, pipelineInput);
      
      const response = await this.client.post(`/pipelines/${pipelineId}/run`, {
        input: pipelineInput,
        timestamp: new Date().toISOString()
      });
      
      const { executionId, status } = response.data;
      console.log(`[PATHWAY] Pipeline ${pipelineId} started: execution ${executionId}`);
      
      return {
        success: true,
        executionId,
        status,
        pipelineId
      };
    } catch (err) {
      console.error(`[PATHWAY] Pipeline run failed:`, err.message);
      throw err;
    }
  }

  async getPipelineStatus(pipelineId, executionId) {
    try {
      const response = await this.client.get(`/pipelines/${pipelineId}/executions/${executionId}`);
      const { status, progress, result, error } = response.data;
      
      console.log(`[PATHWAY] Pipeline ${pipelineId} execution ${executionId} status: ${status}`);
      
      return {
        executionId,
        status,
        progress,
        result,
        error,
        pipelineId
      };
    } catch (err) {
      console.error(`[PATHWAY] Status check failed:`, err.message);
      throw err;
    }
  }

  async pollPipelineCompletion(pipelineId, executionId, maxWait = 60000) {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second
    
    while (Date.now() - startTime < maxWait) {
      try {
        const status = await this.getPipelineStatus(pipelineId, executionId);
        
        if (status.status === 'completed' || status.status === 'failed' || status.status === 'error') {
          return status;
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (err) {
        console.error('[PATHWAY] Poll error:', err.message);
        throw err;
      }
    }
    
    throw new Error(`Pipeline ${pipelineId} execution ${executionId} timed out after ${maxWait}ms`);
  }

  async cancelPipeline(pipelineId, executionId) {
    try {
      const response = await this.client.post(`/pipelines/${pipelineId}/executions/${executionId}/cancel`);
      console.log(`[PATHWAY] Cancelled pipeline ${pipelineId} execution ${executionId}`);
      return { success: true, executionId };
    } catch (err) {
      console.error(`[PATHWAY] Cancel failed:`, err.message);
      throw err;
    }
  }

  async listPipelines() {
    try {
      const response = await this.client.get('/pipelines');
      console.log(`[PATHWAY] Listed ${response.data.length} pipelines`);
      return response.data;
    } catch (err) {
      console.error('[PATHWAY] List pipelines failed:', err.message);
      throw err;
    }
  }

  async getMetrics() {
    try {
      const response = await this.client.get('/metrics');
      console.log('[PATHWAY] Metrics retrieved:', response.data);
      return response.data;
    } catch (err) {
      console.error('[PATHWAY] Metrics failed:', err.message);
      throw err;
    }
  }

  async getHealth() {
    try {
      const response = await this.client.get('/health');
      return {
        status: 'healthy',
        version: response.data.version,
        uptime: response.data.uptime
      };
    } catch (err) {
      return { status: 'unhealthy', error: err.message };
    }
  }
}

module.exports = PathwayWrapper;

// Nicolas Larenas, nlarchive
