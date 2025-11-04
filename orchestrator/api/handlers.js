const express = require('express');
const logger = require('../config/logger');

/**
 * API request handlers
 */
class ApiHandlers {
  constructor(db, workflowEngine) {
    this.db = db;
    this.workflowEngine = workflowEngine;
  }

  /**
   * Validate workflow specification
   * @private
   */
  validateWorkflowSpec(workflowSpec) {
    const errors = [];
    
    if (!workflowSpec || typeof workflowSpec !== 'object') {
      errors.push('Workflow must be an object');
      return errors;
    }
    
    // Required fields
    if (!workflowSpec.name || typeof workflowSpec.name !== 'string') {
      errors.push('Workflow must have a string name');
    } else if (workflowSpec.name.length > 255) {
      errors.push('Workflow name must be 255 characters or less');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(workflowSpec.name)) {
      errors.push('Workflow name must contain only alphanumeric characters, hyphens, and underscores');
    }
    
    if (!workflowSpec.steps || !Array.isArray(workflowSpec.steps)) {
      errors.push('Workflow must have an array of steps');
    } else {
      if (workflowSpec.steps.length === 0) {
        errors.push('Workflow must have at least one step');
      }
      if (workflowSpec.steps.length > 100) {
        errors.push('Workflow cannot have more than 100 steps');
      }
      
      // Validate each step
      workflowSpec.steps.forEach((step, index) => {
        if (!step.id || typeof step.id !== 'string') {
          errors.push(`Step ${index} must have a string id`);
        }
        if (!step.plugin || typeof step.plugin !== 'string') {
          errors.push(`Step ${index} (${step.id || 'unnamed'}) must have a string plugin`);
        }
        if (!step.action || typeof step.action !== 'string') {
          errors.push(`Step ${index} (${step.id || 'unnamed'}) must have a string action`);
        }
        if (step.needs && !Array.isArray(step.needs)) {
          errors.push(`Step ${index} (${step.id || 'unnamed'}) needs must be an array`);
        }
      });
    }
    
    return errors;
  }

  /**
   * Validate plugin specification
   * @private
   */
  validatePluginSpec(plugin) {
    const errors = [];
    
    if (!plugin || typeof plugin !== 'object') {
      errors.push('Plugin must be an object');
      return errors;
    }
    
    // Required fields
    if (!plugin.id || typeof plugin.id !== 'string') {
      errors.push('Plugin must have a string id');
    } else if (plugin.id.length > 255) {
      errors.push('Plugin id must be 255 characters or less');
    } else if (!/^[a-z0-9._-]+$/.test(plugin.id)) {
      errors.push('Plugin id must contain only lowercase letters, numbers, dots, hyphens, and underscores');
    }
    
    if (!plugin.name || typeof plugin.name !== 'string') {
      errors.push('Plugin must have a string name');
    } else if (plugin.name.length > 255) {
      errors.push('Plugin name must be 255 characters or less');
    }
    
    if (!plugin.image || typeof plugin.image !== 'string') {
      errors.push('Plugin must have a string image');
    } else {
      // Basic image validation (registry/repo:tag format)
      if (!/^[a-z0-9._/-]+:[a-z0-9._-]+$/i.test(plugin.image)) {
        errors.push('Plugin image must be in format registry/repo:tag');
      }
    }
    
    if (plugin.version && typeof plugin.version !== 'string') {
      errors.push('Plugin version must be a string');
    }
    
    return errors;
  }

  /**
   * Submit a new workflow
   */
  async submitWorkflow(req, res) {
    try {
      const workflowSpec = req.body;

      // Validate workflow specification
      const validationErrors = this.validateWorkflowSpec(workflowSpec);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Invalid workflow specification',
          message: 'Validation failed',
          details: validationErrors
        });
      }

      const result = await this.workflowEngine.submitWorkflow(workflowSpec);

      res.status(201).json(result);
    } catch (error) {
      logger.error('Failed to submit workflow', { error: error.message });
      res.status(400).json({
        error: 'Failed to submit workflow',
        message: error.message
      });
    }
  }

  /**
   * Get execution status
   */
  async getExecution(req, res) {
    try {
      const { executionId } = req.params;
      const status = this.workflowEngine.getExecutionStatus(executionId);

      if (!status) {
        return res.status(404).json({
          error: 'Execution not found',
          executionId
        });
      }

      res.json(status);
    } catch (error) {
      logger.error('Failed to get execution', { error: error.message });
      res.status(500).json({
        error: 'Failed to get execution',
        message: error.message
      });
    }
  }

  /**
   * List all executions
   */
  async listExecutions(req, res) {
    try {
      const executions = this.db.listExecutions(50);
      res.json({ executions });
    } catch (error) {
      logger.error('Failed to list executions', { error: error.message });
      res.status(500).json({
        error: 'Failed to list executions',
        message: error.message
      });
    }
  }

  /**
   * Get plugin details
   */
  async getPlugin(req, res) {
    try {
      const { pluginId } = req.params;
      const plugin = this.db.getPlugin(pluginId);

      if (!plugin) {
        return res.status(404).json({
          error: 'Plugin not found',
          pluginId
        });
      }

      res.json(plugin);
    } catch (error) {
      logger.error('Failed to get plugin', { error: error.message });
      res.status(500).json({
        error: 'Failed to get plugin',
        message: error.message
      });
    }
  }

  /**
   * List all plugins
   */
  async listPlugins(req, res) {
    try {
      const plugins = this.db.getAllPlugins();
      res.json({ plugins });
    } catch (error) {
      logger.error('Failed to list plugins', { error: error.message });
      res.status(500).json({
        error: 'Failed to list plugins',
        message: error.message
      });
    }
  }

  /**
   * Register a new plugin
   */
  async registerPlugin(req, res) {
    try {
      const plugin = req.body;

      // Validate plugin specification
      const validationErrors = this.validatePluginSpec(plugin);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Invalid plugin specification',
          message: 'Validation failed',
          details: validationErrors
        });
      }

      this.db.createPlugin(plugin);
      logger.info('Plugin registered', { pluginId: plugin.id });

      res.status(201).json({ message: 'Plugin registered', plugin });
    } catch (error) {
      logger.error('Failed to register plugin', { error: error.message });
      res.status(400).json({
        error: 'Failed to register plugin',
        message: error.message
      });
    }
  }

  /**
   * Get engine stats
   */
  async getStats(req, res) {
    try {
      const queueStats = this.workflowEngine.getStats();
      const executionStats = this.db.getExecutionStats();

      const stats = {
        queue: queueStats,
        executions: executionStats.reduce((acc, row) => {
          acc[row.status] = row.count;
          return acc;
        }, {})
      };

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get stats', { error: error.message });
      res.status(500).json({
        error: 'Failed to get stats',
        message: error.message
      });
    }
  }

  /**
   * Health check
   */
  async health(req, res) {
    const result = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {}
    };

    // Check database
    try {
      // lightweight call to ensure DB accessible
      const execStats = this.db.getExecutionStats && this.db.getExecutionStats();
      result.services.db = { status: 'ok', executions: Array.isArray(execStats) ? execStats.length : 0 };
    } catch (err) {
      result.services.db = { status: 'error', message: err.message };
      result.status = 'degraded';
    }

    // Check workflow engine
    try {
      const queueStats = this.workflowEngine && this.workflowEngine.getStats && this.workflowEngine.getStats();
      result.services.engine = { status: this.workflowEngine && this.workflowEngine.isRunning ? 'running' : 'stopped', queue: queueStats };
      if (!this.workflowEngine || !this.workflowEngine.isRunning) {
        result.status = 'degraded';
      }
    } catch (err) {
      result.services.engine = { status: 'error', message: err.message };
      result.status = 'degraded';
    }

    // List registered plugins (we don't have a central plugin manager here);
    try {
      const plugins = this.db.getAllPlugins ? this.db.getAllPlugins() : [];
      result.services.plugins = plugins.map(p => ({ id: p.id, name: p.name, spec: p.spec }));
    } catch (err) {
      result.services.plugins = { status: 'error', message: err.message };
      result.status = 'degraded';
    }

    const code = result.status === 'ok' ? 200 : 503;
    res.status(code).json(result);
  }
}

module.exports = ApiHandlers;

// Nicolas Larenas, nlarchive
