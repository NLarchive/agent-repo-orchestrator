# Orchestrator Mock Services

This directory contains mock services used for testing and development of the orchestrator.

## Services

### pathway-mock/
Mock implementation of Pathway ETL API for testing purposes.

**Files:**
- `simple_server.py` - HTTP mock server that simulates Pathway API endpoints
- `pathway_app.py` - Mock ETL application for testing integrations
- `data/` - Mock data files

**Usage:**
- Used by Docker Compose for integration testing
- Provides `/health`, `/pipelines`, `/metrics`, and `/run` endpoints
- Simulates Pathway ETL pipeline execution

## Adding New Mock Services

When adding new mock services, follow this structure:

```
orchestrator/mocks/
├── service-name-mock/
│   ├── server.py          # Main mock server
│   ├── app.py            # Mock application logic
│   ├── data/             # Mock data files
│   ├── requirements.txt  # Python dependencies
│   └── README.md         # Service documentation
```

## Docker Integration

Mock services are integrated into `docker-compose.yml` for end-to-end testing. Update the compose file when adding new services.

<!-- Nicolas Larenas, nlarchive -->
