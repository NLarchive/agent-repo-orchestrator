const { v4: uuidv4 } = require('uuid');
const DagResolver = require('./dag-resolver');
const StepExecutor = require('./step-executor');
const SqliteQueue = require('./sqlite-queue');
const logger = require('../config/logger');
const metrics = require('../config/metrics');

/**
 * Workflow execution engine
 * Manages workflow lifecycle and task execution
 */
class WorkflowEngine {
  constructor(db) {
    this.db = db;
    this.queue = new SqliteQueue(db);
    this.executor = new StepExecutor(db);
    this.isRunning = false;
  }

  /**
   * Submit a workflow for execution
   */
  async submitWorkflow(workflowSpec) {
    // Validate workflow
    const validation = DagResolver.validate(workflowSpec);
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    // Create workflow record
    const workflowId = uuidv4();
    this.db.createWorkflow({
      id: workflowId,
      name: workflowSpec.name,
      spec: workflowSpec
    });

    // Create execution record
    const executionId = uuidv4();
    this.db.createExecution({
      id: executionId,
      workflow_id: workflowId,
      status: 'pending'
    });

    // Create event
    this.db.createEvent({
      execution_id: executionId,
      event_type: 'workflow_submitted',
      data: { workflowId, name: workflowSpec.name }
    });

    // Enqueue execution
    this.queue.enqueue(executionId, {
      executionId,
      workflowId,
      workflowSpec
    });

    logger.info('Workflow submitted', { executionId, workflowId, name: workflowSpec.name });

    return { executionId, workflowId };
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId) {
    const execution = this.db.getExecution(executionId);
    if (!execution) {
      return null;
    }

    const tasks = this.db.getTasksByExecution(executionId);
    const events = this.db.getEventsByExecution(executionId);

    return {
      ...execution,
      tasks,
      events
    };
  }

  /**
   * Start the workflow engine
   */
  start() {
    if (this.isRunning) {
      logger.warn('Workflow engine already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting workflow engine');

    // Start queue processor
    this.queue.start(async (payload) => {
      await this.processExecution(payload);
    }, 1000);

    // Schedule cleanup
    // keep a reference so it can be cleared on stop (avoids open handles in tests)
    this.cleanupInterval = setInterval(() => {
      this.queue.cleanup();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Stop the workflow engine
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.queue.stop();
    // clear scheduled cleanup if present
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info('Workflow engine stopped');
  }

  /**
   * Process a workflow execution
   */
  async processExecution(payload) {
    const { executionId, workflowSpec } = payload;
    const startTime = Date.now();
    const workflowType = workflowSpec.name || 'unknown';

    logger.info('Processing execution', { executionId });

    try {
      // Update execution status
      this.db.updateExecution(executionId, { status: 'running' });
      this.db.createEvent({
        execution_id: executionId,
        event_type: 'execution_started',
        data: {}
      });

      // Resolve DAG order
      const stepOrder = DagResolver.resolve(workflowSpec);
      const stepMap = new Map(workflowSpec.steps.map(s => [s.id, s]));
      
      // Context to pass between steps
      const context = { steps: {} };

      // Execute steps in order
      for (const stepId of stepOrder) {
        const step = stepMap.get(stepId);
        
        // Create task record
        const taskId = uuidv4();
        this.db.createTask({
          id: taskId,
          execution_id: executionId,
          step_id: step.id,
          plugin_id: step.plugin,
          action: step.action,
          input: step.input || {}
        });

        logger.info('Executing step', { executionId, stepId, taskId });

        try {
          // Update task status
          this.db.updateTask(taskId, { status: 'running' });
          this.db.createEvent({
            execution_id: executionId,
            event_type: 'step_started',
            data: { stepId, taskId }
          });

          // Execute step
          const result = await this.executor.execute(step, context);

          // Store result in context
          context.steps[stepId] = { result };

          // Update task
          this.db.updateTask(taskId, { 
            status: 'completed',
            result,
            attempts: 1
          });

          this.db.createEvent({
            execution_id: executionId,
            event_type: 'step_completed',
            data: { stepId, taskId }
          });

        } catch (error) {
          logger.error('Step failed', { executionId, stepId, error: error.message });

          this.db.updateTask(taskId, {
            status: 'failed',
            error: error.message
          });

          this.db.createEvent({
            execution_id: executionId,
            event_type: 'step_failed',
            data: { stepId, taskId, error: error.message }
          });

          // Fail entire execution
          throw error;
        }
      }

      // Execution succeeded
      this.db.updateExecution(executionId, {
        status: 'completed',
        result: context.steps
      });

      // Record metrics
      const duration = (Date.now() - startTime) / 1000;
      metrics.workflowExecutions.labels(workflowType, 'success').inc();
      metrics.workflowDuration.labels(workflowType).observe(duration);
      metrics.batchProcessingTotal.labels(workflowType, 'success').inc();

      this.db.createEvent({
        execution_id: executionId,
        event_type: 'execution_completed',
        data: {}
      });

      logger.info('Execution completed', { executionId });

    } catch (error) {
      logger.error('Execution failed', { executionId, error: error.message });

      this.db.updateExecution(executionId, {
        status: 'failed',
        error: error.message
      });

      this.db.createEvent({
        execution_id: executionId,
        event_type: 'execution_failed',
        data: { error: error.message }
      });

      // Record error metrics
      const duration = (Date.now() - startTime) / 1000;
      metrics.workflowExecutions.labels(workflowType, 'failed').inc();
      metrics.workflowDuration.labels(workflowType).observe(duration);
      metrics.batchProcessingTotal.labels(workflowType, 'failed').inc();
      metrics.appErrors.labels('workflow', 'execution_failed').inc();

      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return this.queue.getStats();
  }
}

module.exports = WorkflowEngine;

// Nicolas Larenas, nlarchive
