const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const metrics = require('../config/metrics');

class DatabaseClient {
  constructor(dbPath) {
    this.dbPath = dbPath || process.env.DB_PATH || './orchestrator/data/orchestrator.db';
    this.db = null;
  }

  // Track database operation metrics
  _trackQuery(operation) {
    return (fn) => {
      const start = Date.now();
      try {
        const result = fn();
        const duration = (Date.now() - start) / 1000;
        metrics.dbQueryDuration.labels(operation).observe(duration);
        metrics.dbQueryTotal.labels(operation, 'success').inc();
        return result;
      } catch (error) {
        metrics.dbQueryTotal.labels(operation, 'error').inc();
        throw error;
      }
    };
  }

  connect() {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    return this;
  }

  initialize() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema
    this.db.exec(schema);
    
    return this;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  // Plugin methods
  createPlugin(plugin) {
    const stmt = this.db.prepare(`
      INSERT INTO plugins (id, name, image, digest, version, spec)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      plugin.id,
      plugin.name,
      plugin.image,
      plugin.digest || null,
      plugin.version,
      JSON.stringify(plugin)
    );
  }

  getPlugin(id) {
    const stmt = this.db.prepare('SELECT * FROM plugins WHERE id = ?');
    const row = stmt.get(id);
    return row ? { ...row, spec: JSON.parse(row.spec) } : null;
  }

  getAllPlugins() {
    const stmt = this.db.prepare('SELECT * FROM plugins ORDER BY name');
    return stmt.all().map(row => ({ ...row, spec: JSON.parse(row.spec) }));
  }

  updatePlugin(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE plugins 
      SET digest = ?, version = ?, spec = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    return stmt.run(updates.digest, updates.version, JSON.stringify(updates.spec), id);
  }

  // Workflow methods
  createWorkflow(workflow) {
    const stmt = this.db.prepare(`
      INSERT INTO workflows (id, name, spec)
      VALUES (?, ?, ?)
    `);
    
    return stmt.run(workflow.id, workflow.name, JSON.stringify(workflow.spec));
  }

  getWorkflow(id) {
    const stmt = this.db.prepare('SELECT * FROM workflows WHERE id = ?');
    const row = stmt.get(id);
    return row ? { ...row, spec: JSON.parse(row.spec) } : null;
  }

  // Execution methods
  createExecution(execution) {
    const stmt = this.db.prepare(`
      INSERT INTO executions (id, workflow_id, status, started_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    return stmt.run(execution.id, execution.workflow_id, execution.status || 'pending');
  }

  getExecution(id) {
    const stmt = this.db.prepare('SELECT * FROM executions WHERE id = ?');
    const row = stmt.get(id);
    return row ? {
      ...row,
      result: row.result ? JSON.parse(row.result) : null
    } : null;
  }

  /**
   * List executions with workflow name
   * @param {number} limit
   */
  listExecutions(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT e.*, w.name as workflow_name
      FROM executions e
      JOIN workflows w ON e.workflow_id = w.id
      ORDER BY e.started_at DESC
      LIMIT ?
    `);
    return stmt.all(limit).map(row => ({
      ...row,
      result: row.result ? JSON.parse(row.result) : null
    }));
  }

  updateExecution(id, updates) {
    const fields = [];
    const values = [];
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.result !== undefined) {
      fields.push('result = ?');
      values.push(JSON.stringify(updates.result));
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push('completed_at = CURRENT_TIMESTAMP');
    }
    
    values.push(id);
    
    const stmt = this.db.prepare(`
      UPDATE executions SET ${fields.join(', ')} WHERE id = ?
    `);
    
    return stmt.run(...values);
  }

  // Task methods
  createTask(task) {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, execution_id, step_id, plugin_id, action, status, input)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      task.id,
      task.execution_id,
      task.step_id,
      task.plugin_id,
      task.action,
      task.status || 'pending',
      JSON.stringify(task.input || {})
    );
  }

  getTask(id) {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id);
    return row ? {
      ...row,
      input: JSON.parse(row.input),
      result: row.result ? JSON.parse(row.result) : null
    } : null;
  }

  getTasksByExecution(executionId) {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE execution_id = ? ORDER BY created_at');
    return stmt.all(executionId).map(row => ({
      ...row,
      input: JSON.parse(row.input),
      result: row.result ? JSON.parse(row.result) : null
    }));
  }

  updateTask(id, updates) {
    const fields = [];
    const values = [];
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
      
      if (updates.status === 'running') {
        fields.push('started_at = CURRENT_TIMESTAMP');
      } else if (updates.status === 'completed' || updates.status === 'failed') {
        fields.push('completed_at = CURRENT_TIMESTAMP');
      }
    }
    if (updates.result !== undefined) {
      fields.push('result = ?');
      values.push(JSON.stringify(updates.result));
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    if (updates.attempts !== undefined) {
      fields.push('attempts = ?');
      values.push(updates.attempts);
    }
    
    values.push(id);
    
    const stmt = this.db.prepare(`
      UPDATE tasks SET ${fields.join(', ')} WHERE id = ?
    `);
    
    return stmt.run(...values);
  }

  // Event methods
  createEvent(event) {
    const stmt = this.db.prepare(`
      INSERT INTO events (execution_id, event_type, event_data)
      VALUES (?, ?, ?)
    `);
    
    return stmt.run(event.execution_id, event.event_type, JSON.stringify(event.data || {}));
  }

  getEventsByExecution(executionId) {
    const stmt = this.db.prepare('SELECT * FROM events WHERE execution_id = ? ORDER BY timestamp');
    return stmt.all(executionId).map(row => ({
      ...row,
      event_data: JSON.parse(row.event_data)
    }));
  }

  /**
   * Get execution counts grouped by status
   * @returns {Array<{status: string, count: number}>}
   */
  getExecutionStats() {
    const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM executions
      GROUP BY status
    `);
    return stmt.all();
  }
}

module.exports = DatabaseClient;

// Nicolas Larenas, nlarchive
