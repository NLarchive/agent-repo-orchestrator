-- external_repos/postgres_init.sql
-- PostgreSQL initialization script for orchestrator

-- Create orchestrator schema
CREATE SCHEMA IF NOT EXISTS orchestrator;

-- Create plugins table
CREATE TABLE IF NOT EXISTS orchestrator.plugins (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  type VARCHAR(100) NOT NULL,
  config JSONB,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create workflows table
CREATE TABLE IF NOT EXISTS orchestrator.workflows (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  steps JSONB,
  dag JSONB,
  status VARCHAR(50) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create executions table
CREATE TABLE IF NOT EXISTS orchestrator.executions (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES orchestrator.workflows(id),
  status VARCHAR(50) DEFAULT 'pending',
  result JSONB,
  error_log TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS orchestrator.tasks (
  id SERIAL PRIMARY KEY,
  execution_id INTEGER REFERENCES orchestrator.executions(id),
  step_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  result JSONB,
  error_log TEXT,
  duration_ms INTEGER,
  retries INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create events table (for Stack A)
CREATE TABLE IF NOT EXISTS orchestrator.events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  source VARCHAR(255),
  data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_workflows_status ON orchestrator.workflows(status);
CREATE INDEX idx_executions_workflow_id ON orchestrator.executions(workflow_id);
CREATE INDEX idx_executions_status ON orchestrator.executions(status);
CREATE INDEX idx_tasks_execution_id ON orchestrator.tasks(execution_id);
CREATE INDEX idx_events_event_type ON orchestrator.events(event_type);
CREATE INDEX idx_events_created_at ON orchestrator.events(created_at);

-- Insert sample plugins
INSERT INTO orchestrator.plugins (name, type, config, status) VALUES
  ('nats-broker', 'messaging', '{"url": "nats://nats:4222"}', 'active'),
  ('postgres-db', 'database', '{"host": "postgres", "port": 5432, "database": "orchestrator_db"}', 'active'),
  ('minio-storage', 'storage', '{"host": "minio", "port": 9000, "bucket": "orchestrator"}', 'active'),
  ('pathway-etl', 'processing', '{"url": "http://pathway:8000"}', 'active')
ON CONFLICT (name) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON SCHEMA orchestrator TO orchestrator_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA orchestrator TO orchestrator_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA orchestrator TO orchestrator_user;

-- Nicolas Larenas, nlarchive
