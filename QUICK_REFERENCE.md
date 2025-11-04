# Quick Reference Commands

## Access Points
```bash
# Grafana Dashboard
open http://localhost:3001
# Login: admin / admin

# Prometheus UI
open http://localhost:9090

# Metrics Endpoint
curl http://localhost:3000/metrics

# API Health
curl http://localhost:3000/api/health
```

## Generate Test Traffic
```bash
# Generate 50 requests
for i in {1..50}; do curl -s http://localhost:3000/api/health > /dev/null; done

# Check request count in metrics
curl -s http://localhost:3000/metrics | grep "http_requests_total"

# Check uptime
curl -s http://localhost:3000/metrics | grep "process_uptime"
```

## Check Metrics Status
```bash
# Count metrics being exported
curl -s http://localhost:3000/metrics | grep -v "^#" | wc -l

# View HTTP requests tracked
curl -s http://localhost:3000/metrics | grep "http_requests_total{" 

# View request latency
curl -s http://localhost:3000/metrics | grep "http_request_duration_seconds_sum"

# View all endpoints
curl -s http://localhost:3000/metrics | grep -E "path=" | sort | uniq
```

## Prometheus Queries
```bash
# Query: Total HTTP requests
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'

# Query: Request rate (per second)
curl 'http://localhost:9090/api/v1/query?query=rate(http_requests_total[1m])'

# Query: Request latency p95
curl 'http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,http_request_duration_seconds)'

# Query: All endpoints
curl 'http://localhost:9090/api/v1/query?query={__name__=~".*"}'
```

## Docker Operations
```bash
# Check all containers
docker-compose ps

# View orchestrator logs
docker logs orchestrator-api

# View Prometheus logs
docker logs orchestrator-prometheus

# View Grafana logs
docker logs orchestrator-grafana

# Restart orchestrator
docker-compose restart orchestrator

# Rebuild and restart
docker-compose up -d --build orchestrator
```

## Dashboard Operations
```bash
# Login to Grafana
# URL: http://localhost:3001
# User: admin
# Pass: admin

# View dashboard
# Dashboards → Fraud Detection → Production Dashboard

# Refresh dashboard
# Click "Refresh" button (top right)
# Or auto-refresh every 30 seconds
```

## Monitoring Workflows
```bash
# Submit workflow (example)
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-workflow",
    "steps": [
      {
        "id": "step-1",
        "plugin": "nats",
        "action": "test"
      }
    ]
  }'

# List executions
curl http://localhost:3000/api/executions

# Check workflow metrics will populate:
# - workflow_executions_total
# - workflow_duration_seconds
```

## Troubleshooting
```bash
# Verify Prometheus is scraping
curl 'http://localhost:9090/api/v1/targets'

# Check if metrics endpoint responds
curl -v http://localhost:3000/metrics | head -20

# Check if Grafana datasource is configured
curl http://localhost:3001/api/datasources

# View full metrics output
curl http://localhost:3000/metrics

# Count unique time series
curl -s http://localhost:3000/metrics | grep -v "^#" | cut -d'{' -f1 | sort | uniq | wc -l
```

## Performance Baseline
```bash
# Check application latency (should be ~1ms)
curl -w "Time: %{time_total}\n" http://localhost:3000/api/health

# Generate load and check metrics
ab -n 1000 -c 10 http://localhost:3000/api/health

# View metrics after load test
curl -s http://localhost:3000/metrics | grep "http_request_duration"
```

## System Health Check
```bash
# All in one check
echo "API:" && curl -s http://localhost:3000/api/health | jq .status && \
echo "Prometheus:" && curl -s http://localhost:9090/-/healthy && \
echo "Grafana:" && curl -s http://localhost:3001/api/health | jq .database && \
echo "Metrics:" && curl -s http://localhost:3000/metrics | wc -l
```

## Important URLs
```
Grafana:     http://localhost:3001
Prometheus:  http://localhost:9090
Metrics:     http://localhost:3000/metrics
API:         http://localhost:3000
Health:      http://localhost:3000/api/health
```

## Metric Names (All Available)
```
http_request_duration_seconds
http_requests_total
workflow_executions_total
workflow_duration_seconds
batch_processing_total
batch_processing_duration_seconds
batch_items_processed_total
batch_queue_size
batch_error_rate
fraud_detections_total
fraud_confidence_score
db_query_duration_seconds
db_queries_total
db_connections_active
app_errors_total
active_connections
process_uptime_seconds
plugin_executions_total
plugin_duration_seconds
```

---

**All systems live and monitoring!**

<!-- Nicolas Larenas, nlarchive -->
