# Automated Sales Report Workflow

A business application workflow that demonstrates automated report generation for enterprise data analytics. This workflow showcases a profitable automation pattern that can reduce manual reporting efforts and enable real-time business intelligence.

## Overview

This workflow implements a complete automated reporting pipeline:

1. **Data Retrieval**: Queries sales/transaction data from PostgreSQL
2. **Report Generation**: Processes data through Pathway ETL for aggregation and analysis
3. **Artifact Storage**: Saves formatted reports to MinIO for business access
4. **Audit Logging**: Records successful generation in the database
5. **Event Notification**: Publishes completion events to NATS for downstream systems

## Business Value

- **Automation**: Eliminates manual report generation tasks
- **Real-time Intelligence**: Provides fresh data for decision-making
- **Scalability**: Handles growing data volumes automatically
- **Integration**: Feeds into dashboards, email alerts, and BI systems
- **Cost Reduction**: Reduces analyst time spent on repetitive reporting

## Workflow Steps

```json
{
  "name": "automated-sales-report",
  "description": "Generates daily sales reports by querying transaction data, processing with Pathway ETL, storing reports in MinIO, logging completion, and sending notifications",
  "steps": [
    {
      "id": "query-sales-data",
      "plugin": "postgres",
      "action": "select",
      "input": {
        "table": "orchestrator.events",
        "where": {},
        "limit": 10
      }
    },
    {
      "id": "generate-report",
      "plugin": "pathway",
      "action": "runPipeline",
      "needs": ["query-sales-data"],
      "input": {
        "pipelineId": "sales-aggregation-pipeline",
        "input": {
          "salesData": "{{ steps.query-sales-data.result }}",
          "reportType": "daily-summary",
          "includeMetrics": ["totalRevenue", "topProducts", "regionalBreakdown"]
        }
      }
    },
    {
      "id": "store-report",
      "plugin": "minio",
      "action": "putObject",
      "needs": ["generate-report"],
      "input": {
        "key": "reports/daily-sales-2025-10-31.json",
        "data": "{{ steps.generate-report.result }}"
      }
    },
    {
      "id": "log-completion",
      "plugin": "postgres",
      "action": "insert",
      "needs": ["store-report"],
      "input": {
        "table": "orchestrator.events",
        "data": {
          "event_type": "report_generated",
          "data": "{\"reportType\": \"daily-sales\", \"date\": \"2025-10-31\", \"status\": \"completed\"}"
        }
      }
    },
    {
      "id": "send-notification",
      "plugin": "nats",
      "action": "publish",
      "needs": ["log-completion"],
      "input": {
        "subject": "reports.sales.daily",
        "message": {
          "type": "report_ready",
          "reportKey": "reports/daily-sales-2025-10-31.json",
          "generatedAt": "2025-10-31T12:00:00Z",
          "summary": "Daily sales report generated and stored successfully"
        }
      }
    }
  ]
}
```

## Running the Workflow

```bash
# From workflows/ directory
node common/run-local-e2e.js ../workflows/sales-report-workflow/workflow.json
```

## Expected Output

- **MinIO Report**: `reports/daily-sales-2025-10-31.json` containing processed sales analytics
- **Database Logs**: Report generation events in `orchestrator.events`
- **NATS Events**: Notification messages on `reports.sales.daily` subject
- **Local Download**: Results available in `workflows/outputs/result.json`

## Production Deployment

For production use:

1. **Database Setup**: Create proper `sales.transactions` table with sales data
2. **Scheduling**: Use cron or workflow scheduler for daily execution
3. **Monitoring**: Set up alerts for workflow failures
4. **Access Control**: Configure MinIO permissions for report consumers
5. **NATS Consumers**: Implement downstream services to process notifications

## Customization

- Modify the Pathway pipeline for different aggregation logic
- Add more metrics or report formats
- Integrate with additional data sources
- Implement report distribution (email, Slack, etc.)
- Add data validation and quality checks