# Common Scripts and Utilities

This folder contains shared scripts and utilities used across all workflows in the orchestrator system. These utilities provide common functionality for workflow testing, execution, and management.

## Scripts Overview

### `run-sample.js`
**Purpose**: Simple workflow submission utility for basic testing and development.

**Usage**:
```bash
node run-sample.js <workflow-path>
```

**Features**:
- Submits workflow JSON to orchestrator API
- Basic error handling and status reporting
- Minimal dependencies for quick testing

### `run-local-e2e.js`
**Purpose**: Comprehensive local end-to-end testing script that orchestrates the complete workflow execution environment.

**Usage**:
```bash
node run-local-e2e.js <workflow-path>
```

**Features**:
- Starts docker-compose services (NATS, Postgres, MinIO, Pathway)
- Initializes local orchestrator with SQLite database
- Registers all required plugins
- Executes workflow and monitors completion
- Downloads results from MinIO to workflow outputs
- Comprehensive logging and error reporting

**Environment Requirements**:
- Docker and docker-compose
- Node.js runtime
- Available ports: 3000 (orchestrator), 4222 (NATS), 5432 (Postgres), 9000 (MinIO), 8000 (Pathway)

### `run-e2e.js`
**Purpose**: Full end-to-end testing script for containerized orchestrator deployments.

**Usage**:
```bash
node run-e2e.js <workflow-path>
```

**Features**:
- Assumes containerized orchestrator via docker-compose
- Manages all services through Docker
- Production-like testing environment
- Automated service lifecycle management

## Architecture

These scripts follow a layered architecture:

1. **Service Management**: Docker Compose orchestration
2. **Orchestrator Setup**: Database initialization and plugin registration
3. **Workflow Execution**: API submission and monitoring
4. **Result Collection**: Artifact retrieval and validation

## Dependencies

- `axios`: HTTP client for API calls
- `docker-compose`: Service orchestration
- `sqlite3`: Local database for orchestrator state
- Orchestrator plugins: minio, postgres, pathway, nats

## Error Handling

All scripts include comprehensive error handling:
- Service startup validation
- API health checks
- Workflow execution monitoring
- Graceful cleanup on failures

## Development Notes

- Scripts are designed to be idempotent
- Database is recreated on each run for clean testing
- Logs are written to orchestrator/logs/ directory
- Results are stored in workflow-specific output directories

<!-- Nicolas Larenas, nlarchive -->
