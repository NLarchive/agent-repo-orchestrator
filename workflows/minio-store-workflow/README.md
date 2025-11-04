# MinIO Store Workflow

A basic demonstration workflow that showcases the core orchestrator functionality by running a Pathway ETL pipeline and storing the results in MinIO.

## Overview

This workflow demonstrates the fundamental integration between the orchestrator's components:

1. **Pathway Processing**: Executes an ETL pipeline to process sample data
2. **MinIO Storage**: Stores the processing results as JSON artifacts
3. **Audit Logging**: Records workflow completion in PostgreSQL

## Workflow Steps

```json
{
  "name": "minio-store-sample",
  "steps": [
    {
      "id": "run-pathway",
      "plugin": "pathway",
      "action": "runPipeline",
      "input": {
        "pipelineId": "sample-pipeline",
        "input": {
          "source": "local",
          "count": 150
        }
      }
    },
    {
      "id": "store-results",
      "plugin": "minio",
      "action": "putObject",
      "needs": ["run-pathway"],
      "input": {
        "key": "outputs/minio-store-sample/result.json",
        "data": "{{ steps.run-pathway.result }}"
      }
    },
    {
      "id": "emit-event",
      "plugin": "postgres",
      "action": "insert",
      "needs": ["store-results"],
      "input": {
        "table": "orchestrator.events",
        "data": {
          "event_type": "workflow_completed",
          "data": "{\"workflow\": \"minio-store-sample\"}"
        }
      }
    }
  ]
}
```

## Running the Workflow

```bash
# From workflows/ directory
node common/run-local-e2e.js ../workflows/minio-store-workflow/workflow.json
```

Or using the simple runner:

```bash
node common/run-sample.js minio-store-workflow/workflow.json
```

## Expected Output

- **MinIO Artifact**: `outputs/minio-store-sample/result.json` containing Pathway pipeline results
- **Database Log**: Completion event inserted into `orchestrator.events`
- **Local Download**: Results available in `workflows/outputs/result.json`

## Use Cases

This basic pattern serves as a foundation for:
- Data processing pipelines
- ETL result storage
- Workflow audit trails
- Integration testing of orchestrator components