const logger = require('../config/logger');

/**
 * SQLite-based task queue for workflow execution
 * Simple, file-based queue with retry support
 */
class SqliteQueue {
  constructor(db) {
    this.db = db;
    this.processingInterval = null;
    this.isProcessing = false;
  }

  static formatTimestamp(date = new Date()) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  /**
   * Add a task to the queue
   */
  enqueue(taskId, payload, options = {}) {
    const stmt = this.db.db.prepare(`
      INSERT INTO task_queue (task_id, priority, payload, max_retries, scheduled_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const priority = options.priority || 0;
    const maxRetries = options.maxRetries || 3;
    const scheduledDate = options.delay
      ? new Date(Date.now() + options.delay)
      : new Date();
    const scheduledAt = SqliteQueue.formatTimestamp(scheduledDate);

    try {
      stmt.run(
        taskId,
        priority,
        JSON.stringify(payload),
        maxRetries,
        scheduledAt
      );
      logger.debug('Task enqueued', { taskId, priority });
      return true;
    } catch (error) {
      logger.error('Failed to enqueue task', { taskId, error: error.message });
      return false;
    }
  }

  /**
   * Get next pending task
   */
  dequeue() {
    const stmt = this.db.db.prepare(`
      SELECT * FROM task_queue
      WHERE status = 'pending'
        AND datetime(scheduled_at) <= datetime('now')
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `);

    const row = stmt.get();
    
    if (!row) {
      return null;
    }

    // Mark as processing
    const updateStmt = this.db.db.prepare(`
      UPDATE task_queue
      SET status = 'processing', started_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(row.id);

    return {
      ...row,
      payload: JSON.parse(row.payload)
    };
  }

  /**
   * Mark task as completed
   */
  complete(taskId) {
    const stmt = this.db.db.prepare(`
      UPDATE task_queue
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE task_id = ?
    `);

    stmt.run(taskId);
    logger.debug('Task completed', { taskId });
  }

  /**
   * Mark task as failed and potentially retry
   */
  fail(taskId, error) {
    const getStmt = this.db.db.prepare(`
      SELECT retry_count, max_retries FROM task_queue WHERE task_id = ?
    `);
    const task = getStmt.get(taskId);

    if (!task) {
      logger.error('Task not found for failure', { taskId });
      return;
    }

    const newRetryCount = task.retry_count + 1;
    
    if (newRetryCount < task.max_retries) {
      // Retry with exponential backoff
  const delayMs = Math.pow(2, newRetryCount) * 1000; // 2s, 4s, 8s...
  const scheduledAt = SqliteQueue.formatTimestamp(new Date(Date.now() + delayMs));

      const stmt = this.db.db.prepare(`
        UPDATE task_queue
        SET status = 'pending',
            retry_count = ?,
            scheduled_at = ?
        WHERE task_id = ?
      `);

      stmt.run(newRetryCount, scheduledAt, taskId);
      logger.warn('Task failed, will retry', { taskId, retryCount: newRetryCount, delayMs });
    } else {
      // Max retries reached
      const stmt = this.db.db.prepare(`
        UPDATE task_queue
        SET status = 'failed',
            completed_at = CURRENT_TIMESTAMP
        WHERE task_id = ?
      `);

      stmt.run(taskId);
      logger.error('Task failed after max retries', { taskId, error: error?.message });
    }
  }

  /**
   * Start processing queue
   */
  start(processor, intervalMs = 1000) {
    if (this.processingInterval) {
      logger.warn('Queue processor already started');
      return;
    }

    logger.info('Starting queue processor', { intervalMs });

    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) {
        return;
      }

      this.isProcessing = true;

      try {
        const task = this.dequeue();
        
        if (task) {
          try {
            await processor(task.payload);
            this.complete(task.task_id);
          } catch (error) {
            logger.error('Task processor error', { taskId: task.task_id, error: error.message });
            this.fail(task.task_id, error);
          }
        }
      } catch (error) {
        logger.error('Queue processing error', { error: error.message });
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);
  }

  /**
   * Stop processing queue
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('Queue processor stopped');
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const stmt = this.db.db.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM task_queue
      GROUP BY status
    `);

    const rows = stmt.all();
    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    rows.forEach(row => {
      stats[row.status] = row.count;
    });

    return stats;
  }

  /**
   * Clear completed tasks older than specified time
   */
  cleanup(olderThanMs = 24 * 60 * 60 * 1000) {
    const cutoffTime = new Date(Date.now() - olderThanMs).toISOString();
    
    const stmt = this.db.db.prepare(`
      DELETE FROM task_queue
      WHERE status IN ('completed', 'failed')
        AND completed_at < ?
    `);

    const result = stmt.run(cutoffTime);
    logger.info('Queue cleanup completed', { deletedRows: result.changes });
    
    return result.changes;
  }
}

module.exports = SqliteQueue;

// Nicolas Larenas, nlarchive
