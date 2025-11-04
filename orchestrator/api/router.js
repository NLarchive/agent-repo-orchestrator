const express = require('express');
const ApiHandlers = require('./handlers');

/**
 * Create Express router with all API routes
 */
function createRouter(db, workflowEngine) {
  const router = express.Router();
  const handlers = new ApiHandlers(db, workflowEngine);

  // Health check
  router.get('/health', (req, res) => handlers.health(req, res));

  // Workflows
  router.post('/workflows', (req, res) => handlers.submitWorkflow(req, res));

  // Executions
  router.get('/executions', (req, res) => handlers.listExecutions(req, res));
  router.get('/executions/:executionId', (req, res) => handlers.getExecution(req, res));

  // Plugins
  router.get('/plugins', (req, res) => handlers.listPlugins(req, res));
  router.get('/plugins/:pluginId', (req, res) => handlers.getPlugin(req, res));
  router.post('/plugins', (req, res) => handlers.registerPlugin(req, res));

  // Stats
  router.get('/stats', (req, res) => handlers.getStats(req, res));

  return router;
}

module.exports = { createRouter };

// Nicolas Larenas, nlarchive
