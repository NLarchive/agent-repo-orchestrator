// orchestrator/plugins/postgres-wrapper.js
// PostgreSQL plugin wrapper for orchestrator

class PostgresWrapper {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.POSTGRES_HOST || 'localhost',
      port: config.port || process.env.POSTGRES_PORT || 5432,
      database: config.database || process.env.POSTGRES_DB || 'postgres',
      user: config.user || process.env.POSTGRES_USER || 'postgres',
      password: config.password || process.env.POSTGRES_PASSWORD || 'postgres',
      ...config
    };
    this.db = null;
  }

  async connect() {
    try {
      // For this demo, we'll use better-sqlite3 as a local proxy
      // In production, use pg or postgres.js for remote connections
      const connectionString = `postgresql://${this.config.user}:${this.config.password}@${this.config.host}:${this.config.port}/${this.config.database}`;
      console.log(`[POSTGRES] Connecting to ${connectionString.replace(this.config.password, '***')}`);
      
      // Import postgres client for real connection
      const postgres = require('postgres');
      this.sql = postgres({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        username: this.config.user,
        password: this.config.password,
        max: 10
      });
      
      await this.sql`SELECT 1`;
      console.log('[POSTGRES] Connected successfully');
      return true;
    } catch (err) {
      console.error('[POSTGRES] Connection failed:', err.message);
      throw err;
    }
  }

  async disconnect() {
    if (this.sql) {
      await this.sql.end();
      console.log('[POSTGRES] Disconnected');
    }
  }

  async query(sql, params = []) {
    if (!this.sql) throw new Error('PostgreSQL not connected');

    const maxRetries = Number.isInteger(this.config.retries) ? this.config.retries : 0;
    const baseDelay = this.config.retryBaseDelay || 200; // ms
    let attempt = 0;

    while (true) {
      try {
        const result = await this.sql.unsafe(sql, params);
        console.log(`[POSTGRES] Query executed, rows: ${Array.isArray(result) ? result.length : 1}`);
        return result;
      } catch (err) {
        attempt += 1;
        if (attempt > maxRetries) {
          console.error('[POSTGRES] Query failed:', err.message);
          throw err;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(`[POSTGRES] Query attempt ${attempt} failed, retrying in ${delay}ms:`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Validate table name to prevent SQL injection
   * @private
   */
  validateTableName(table) {
    // Only allow alphanumeric, underscore, and dot (for schema.table)
    const validPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
    if (!validPattern.test(table)) {
      throw new Error(`Invalid table name: ${table}. Only alphanumeric characters, underscores, and dots allowed.`);
    }
    // Prevent common SQL injection patterns
    const dangerous = ['--', ';', '/*', '*/', 'xp_', 'sp_', 'DROP', 'DELETE', 'INSERT', 'UPDATE', 'EXEC'];
    const upperTable = table.toUpperCase();
    for (const pattern of dangerous) {
      if (upperTable.includes(pattern)) {
        throw new Error(`Potentially dangerous pattern in table name: ${table}`);
      }
    }
    return table;
  }

  async insert(input) {
    const { table, data } = input;
    if (!this.sql) throw new Error('PostgreSQL not connected');
    if (!table) throw new Error('Table name is required for insert');
    if (!data || typeof data !== 'object') throw new Error('Data object is required for insert');
    
    const validatedTable = this.validateTableName(table); // Validate before use
    
    try {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
      
      const sql = `INSERT INTO ${validatedTable} (${columns.join(',')}) VALUES (${placeholders}) RETURNING *`;
      const result = await this.query(sql, values);
      console.log(`[POSTGRES] Inserted into ${validatedTable}:`, result);
      return result;
    } catch (err) {
      console.error(`[POSTGRES] Insert failed on ${table}:`, err.message);
      throw err;
    }
  }

  async select(input) {
    const { table, where = {}, limit = 100, columns = null } = input;
    if (!this.sql) throw new Error('PostgreSQL not connected');
    if (!table) throw new Error('Table name is required for select');
    
    const validatedTable = this.validateTableName(table); // Validate before use
    
    // Validate limit to prevent resource exhaustion
    const maxLimit = 10000;
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10)), maxLimit);
    
    try {
      let sql = `SELECT ${columns && Array.isArray(columns) ? columns.join(', ') : '*'} FROM ${validatedTable}`;
      const params = [];
      
      if (Object.keys(where).length > 0) {
        const conditions = Object.entries(where).map(([key, value]) => {
          if (value === null) {
            return `${key} IS NULL`;
          } else if (Array.isArray(value)) {
            // Handle IN clause for arrays
            const placeholders = value.map((_, i) => `$${params.length + i + 1}`).join(', ');
            params.push(...value);
            return `${key} IN (${placeholders})`;
          } else {
            params.push(value);
            return `${key} = $${params.length}`;
          }
        }).join(' AND ');
        sql += ` WHERE ${conditions}`;
      }
      
      sql += ` LIMIT ${safeLimit}`;
      const result = await this.query(sql, params);
      console.log(`[POSTGRES] Selected from ${validatedTable}: ${Array.isArray(result) ? result.length : 1} rows`);
      return result;
    } catch (err) {
      console.error(`[POSTGRES] Select failed on ${validatedTable}:`, err.message);
      throw err;
    }
  }

  async update(input) {
    const { table, data, where } = input;
    if (!this.sql) throw new Error('PostgreSQL not connected');
    if (!table) throw new Error('Table name is required for update');
    if (!data || typeof data !== 'object') throw new Error('Data object is required for update');
    if (!where || typeof where !== 'object') throw new Error('Where object is required for update');
    
    const validatedTable = this.validateTableName(table); // Validate before use
    
    try {
      const updateColumns = Object.keys(data);
      const updateValues = Object.values(data);
      const whereColumns = Object.keys(where);
      const whereValues = Object.values(where);
      
      const setClause = updateColumns.map((col, i) => `${col} = $${i + 1}`).join(',');
      const whereClause = whereColumns.map((col, i) => `${col} = $${updateColumns.length + i + 1}`).join(' AND ');
      
      const sql = `UPDATE ${validatedTable} SET ${setClause} WHERE ${whereClause} RETURNING *`;
      const allValues = [...updateValues, ...whereValues];
      
      const result = await this.query(sql, allValues);
      console.log(`[POSTGRES] Updated ${validatedTable}:`, result);
      return result;
    } catch (err) {
      console.error(`[POSTGRES] Update failed on ${table}:`, err.message);
      throw err;
    }
  }

  async getHealth() {
    try {
      await this.query('SELECT 1');
      return { status: 'healthy', connected: true };
    } catch (err) {
      return { status: 'unhealthy', error: err.message, connected: false };
    }
  }
}

module.exports = PostgresWrapper;

// Nicolas Larenas, nlarchive
