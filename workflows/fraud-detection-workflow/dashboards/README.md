# Fraud Detection Grafana Dashboard

## Overview

Production-ready Grafana dashboard for real-time monitoring of the fraud detection system. Provides comprehensive visibility into transaction throughput, error rates, latency, alerts, system health, and operational metrics.

## Dashboard Features

### 13 Monitoring Panels:
1. **Transaction Throughput** - Time series showing received/processed transaction rates
2. **Current Throughput (TPS)** - Gauge showing current transactions per second
3. **Error Rate** - Stat panel showing 5-minute error rate
4. **Processing Errors by Module** - Time series breaking down errors by module and type
5. **Transaction Processing Latency** - Histogram showing p50/p95/p99 latency by stage
6. **Batch Processing Duration** - Time series showing batch processing performance
7. **Current Queue Size** - Gauge showing transaction batch queue depth
8. **System Health Status** - Status panel showing component health (UP/DOWN)
9. **Test Pass Rate** - Stat panel showing percentage of passing tests
10. **Top 10 Alert Types** - Bar chart of most frequent alerts in past hour
11. **Alerts by Severity** - Stacked time series of alerts by severity level
12. **Transaction Rejections** - Time series showing rejections by reason
13. **Response Triggers** - Time series showing trigger execution by type and status

## Installation

### Prerequisites
- Grafana 8.0+ installed and running
- Prometheus datasource configured in Grafana
- Fraud detection metrics server running on `http://localhost:9090`

### Import Dashboard

#### Option 1: Grafana UI Import
1. Open Grafana (default: `http://localhost:3000`)
2. Navigate to **Dashboards → Import** (+ icon → Import)
3. Click **Upload JSON file**
4. Select `fraud-detection-dashboard.json`
5. Select your Prometheus datasource from the dropdown
6. Click **Import**

#### Option 2: API Import
```powershell
# Replace with your Grafana credentials and URL
$grafanaUrl = "http://localhost:3000"
$apiKey = "your-api-key-here"

$headers = @{
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

$dashboardJson = Get-Content -Path "fraud-detection-dashboard.json" -Raw
$body = @{
    dashboard = ($dashboardJson | ConvertFrom-Json)
    overwrite = $true
} | ConvertTo-Json -Depth 100

Invoke-RestMethod -Uri "$grafanaUrl/api/dashboards/db" -Method Post -Headers $headers -Body $body
```

#### Option 3: Provisioning
Place the dashboard JSON in Grafana's provisioning directory:

```powershell
# Windows
Copy-Item fraud-detection-dashboard.json -Destination "C:\Program Files\GrafanaLabs\grafana\conf\provisioning\dashboards\"

# Linux/Mac
cp fraud-detection-dashboard.json /etc/grafana/provisioning/dashboards/
```

## Configuration

### Prometheus Datasource Setup
If you haven't configured Prometheus as a datasource:

1. Navigate to **Configuration → Data Sources** (gear icon)
2. Click **Add data source**
3. Select **Prometheus**
4. Configure:
   - **Name**: `Prometheus`
   - **URL**: `http://localhost:9090`
   - **Access**: `Server (default)`
5. Click **Save & Test**

### Dashboard Variables
The dashboard uses one template variable:
- `DS_PROMETHEUS` - Allows switching between Prometheus datasources

### Refresh Rate
- Default: **10 seconds** (configurable in top-right dropdown)
- Time range: **Last 1 hour** (configurable)

## Panel Descriptions

### 1. Transaction Throughput (5m rate)
**Type**: Time Series  
**Metrics**:
- `rate(fraud_detection_transactions_received_total[5m])`
- `rate(fraud_detection_transactions_processed_total[5m])`

**Usage**: Monitor overall system throughput. Compare received vs. processed to detect processing lag.

### 2. Current Throughput (TPS)
**Type**: Gauge  
**Metric**: `sum(rate(fraud_detection_transactions_received_total[5m]))`  
**Thresholds**:
- Green: 0-50 TPS
- Yellow: 50-100 TPS
- Red: >100 TPS

**Usage**: Quick view of current load. Red indicates high traffic.

### 3. Error Rate (5m)
**Type**: Stat  
**Metric**: `sum(rate(fraud_detection_processing_errors_total[5m]))`  
**Thresholds**:
- Green: 0 errors/sec
- Red: ≥1 error/sec

**Usage**: Immediate alert to processing issues. Red background indicates errors occurring.

### 4. Processing Errors by Module
**Type**: Time Series  
**Metric**: `rate(fraud_detection_processing_errors_total[5m])` by module and error_type  
**Usage**: Drill down to identify which module is experiencing errors.

### 5. Transaction Processing Latency
**Type**: Histogram  
**Metrics**:
- p50: `histogram_quantile(0.50, ...fraud_detection_transaction_processing_duration_seconds_bucket...)`
- p95: `histogram_quantile(0.95, ...)`
- p99: `histogram_quantile(0.99, ...)`

**Usage**: Understand latency distribution. Focus on p95/p99 for SLA compliance.

### 6. Batch Processing Duration
**Type**: Time Series  
**Metrics**: p50 and p95 of batch processing duration by batch_size_range  
**Usage**: Monitor batch efficiency. Higher batch sizes should have better throughput.

### 7. Current Queue Size
**Type**: Gauge  
**Metric**: `fraud_detection_queue_size{queue_type="transaction_batch"}`  
**Thresholds**:
- Green: 0-50
- Yellow: 50-100
- Red: >100

**Usage**: Detect backlog. Red indicates processing can't keep up with ingestion.

### 8. System Health Status
**Type**: Stat  
**Metric**: `fraud_detection_system_health_status` by component  
**Mappings**:
- 1 = UP (green)
- 0 = DOWN (red)

**Usage**: Quick health check of all system components (PostgreSQL, NATS, MinIO, etc.).

### 9. Test Pass Rate
**Type**: Stat  
**Metric**: `(sum(fraud_detection_tests_total) - sum(fraud_detection_tests_failed)) / sum(fraud_detection_tests_total) * 100`  
**Thresholds**:
- Red: <90%
- Yellow: 90-95%
- Green: ≥95%

**Usage**: Monitor test suite health. Below 95% requires investigation.

### 10. Top 10 Alert Types (1h)
**Type**: Bar Chart (Time Series with bars)  
**Metric**: `topk(10, sum by (alert_type) (increase(fraud_detection_alerts_generated_total[1h])))`  
**Usage**: Identify most common alert patterns. Investigate spikes.

### 11. Alerts by Severity
**Type**: Stacked Time Series  
**Metric**: `sum by (severity) (rate(fraud_detection_alerts_generated_total[5m]))`  
**Usage**: Monitor alert severity distribution. High critical alerts require immediate attention.

### 12. Transaction Rejections by Reason
**Type**: Time Series  
**Metric**: `rate(fraud_detection_transactions_rejected_total[5m])` by reason  
**Usage**: Understand why transactions are being rejected (validation, fraud score, etc.).

### 13. Response Triggers
**Type**: Time Series  
**Metric**: `rate(fraud_detection_response_triggers_executed_total[5m])` by trigger_type and status  
**Usage**: Monitor automated response execution. Track success/failure rates.

## Testing the Dashboard

### Start Metrics Server
```powershell
cd workflows/fraud-detection-workflow
node metrics/metrics-server.js
```

### Generate Test Data
```powershell
# Run demo for 2 minutes
node metrics/demo.js --duration 120

# Or run once
node metrics/demo.js --once

# Or run continuously (create STOP_DEMO file to stop)
node metrics/demo.js
```

### Verify Metrics Endpoint
```powershell
# Check metrics are being exposed
curl http://localhost:9090/metrics

# Check health endpoint
curl http://localhost:9090/health
```

### Expected Output
- All panels should populate with data within 10-30 seconds
- Time series panels should show activity
- Gauges should display current values
- System health should show components as UP (green)

## Troubleshooting

### Panels Show "No Data"
**Cause**: Prometheus can't scrape metrics or metrics server not running

**Solution**:
1. Verify metrics server is running: `curl http://localhost:9090/metrics`
2. Check Prometheus datasource configuration in Grafana
3. Ensure Prometheus is scraping `localhost:9090` (check `prometheus.yml`)
4. Run demo to generate metrics: `node metrics/demo.js --duration 60`

### "Unable to connect to Prometheus"
**Cause**: Prometheus datasource misconfigured or Prometheus not running

**Solution**:
1. Verify Prometheus is running (usually `http://localhost:9090` for Prometheus itself)
2. Note: Our metrics server also runs on 9090 - you may need to configure Prometheus to scrape it
3. Check Grafana datasource points to correct Prometheus instance
4. Test connection in **Data Sources** settings

### Histogram Panels Empty
**Cause**: No histogram data or incorrect bucket configuration

**Solution**:
1. Verify histogram metrics exist: `curl http://localhost:9090/metrics | grep _bucket`
2. Run demo to generate histogram data: `node metrics/demo.js --duration 120`
3. Wait 1-2 minutes for data to accumulate
4. Check bucket ranges in prometheus-service.js match dashboard queries

### Test Pass Rate Shows "N/A"
**Cause**: Test metrics not being collected

**Solution**:
1. Run test suite to generate test metrics: `npm test`
2. Ensure test runner is configured to export metrics
3. Check `fraud_detection_tests_total` and `fraud_detection_tests_failed` exist

### System Health Shows All DOWN
**Cause**: System components not instrumented or not running

**Solution**:
1. Verify all components (PostgreSQL, NATS, MinIO) are running
2. Check metrics are being updated: `curl http://localhost:9090/metrics | grep health_status`
3. Run demo which simulates health checks: `node metrics/demo.js --duration 60`

## Alert Configuration (Optional)

### Create Grafana Alerts
The dashboard supports alerting on key metrics:

#### High Error Rate Alert
1. Edit "Error Rate (5m)" panel
2. Go to **Alert** tab
3. Create alert rule:
   - **Condition**: `WHEN last() OF query(A) IS ABOVE 10`
   - **Evaluate every**: 1m
   - **For**: 2m
4. Configure notification channel

#### High Queue Size Alert
1. Edit "Current Queue Size" panel
2. Create alert rule:
   - **Condition**: `WHEN last() OF query(A) IS ABOVE 100`
   - **Evaluate every**: 30s
   - **For**: 1m

#### Low Test Pass Rate Alert
1. Edit "Test Pass Rate" panel
2. Create alert rule:
   - **Condition**: `WHEN last() OF query(A) IS BELOW 95`
   - **Evaluate every**: 5m
   - **For**: 5m

## Performance Tuning

### Heavy Query Load
If dashboard is slow to load:

1. **Increase refresh interval**: Change from 10s to 30s or 1m
2. **Reduce time range**: Use "Last 30m" instead of "Last 1h"
3. **Disable auto-refresh**: Pause refresh (icon in top-right)
4. **Optimize Prometheus**: Increase retention, add more resources

### Missing Historical Data
Configure Prometheus retention:

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

storage:
  retention.time: 15d  # Keep 15 days of data
```

## Customization

### Add Custom Panels
1. Click **Add panel** (+ icon in dashboard)
2. Select visualization type
3. Configure query from available metrics:
   - `fraud_detection_*_total` - Counter metrics
   - `fraud_detection_*_duration_*` - Histogram metrics
   - `fraud_detection_queue_size` - Gauge metric
   - `fraud_detection_system_health_status` - Health status
   - `fraud_detection_risk_score_*` - Risk scoring metrics
   - `fraud_detection_compliance_*` - Compliance metrics

### Modify Time Ranges
Default queries use:
- `[5m]` - 5-minute rate for most metrics
- `[1h]` - 1-hour increase for alert aggregation

Adjust these in panel queries for different granularity.

### Export Modified Dashboard
1. Click **Dashboard settings** (gear icon)
2. Select **JSON Model**
3. Copy JSON or click **Save as file**
4. Save to `fraud-detection-dashboard.json`

## Integration with CI/CD

### Automated Testing
```powershell
# Start services
docker-compose up -d

# Start metrics server
Start-Process -NoNewWindow node -ArgumentList "metrics/metrics-server.js"

# Generate test data
node metrics/demo.js --duration 60

# Verify dashboard queries (requires Grafana API)
# ... query validation logic ...

# Cleanup
Stop-Process -Name node -Force
docker-compose down
```

### Dashboard as Code
- Dashboard JSON is version-controlled
- Changes tracked in git
- Can be provisioned automatically in deployments
- Use Grafana provisioning for automated deployments

## Metrics Reference

### All Available Metrics
See `metrics/prometheus-service.js` for complete metric definitions:

**Transaction Metrics**:
- `fraud_detection_transactions_received_total`
- `fraud_detection_transactions_processed_total`
- `fraud_detection_transactions_rejected_total`

**Performance Metrics**:
- `fraud_detection_transaction_processing_duration_seconds`
- `fraud_detection_batch_processing_duration_seconds`
- `fraud_detection_queue_size`

**Error Metrics**:
- `fraud_detection_processing_errors_total`

**Risk & Compliance**:
- `fraud_detection_risk_score_distribution`
- `fraud_detection_risk_scores_calculated_total`
- `fraud_detection_compliance_checks_total`
- `fraud_detection_compliance_violations_total`

**Alerts & Responses**:
- `fraud_detection_alerts_generated_total`
- `fraud_detection_response_triggers_executed_total`

**System Health**:
- `fraud_detection_system_health_status`
- `fraud_detection_tests_total`
- `fraud_detection_tests_failed`

## Support

For issues or questions:
1. Check troubleshooting section above
2. Verify metrics are being generated: `curl http://localhost:9090/metrics`
3. Check Grafana logs for datasource errors
4. Review Prometheus logs for scraping issues

## Version History

- **v1.0** - Initial production dashboard
  - 13 monitoring panels
  - Prometheus datasource variable
  - 10-second refresh rate
  - Dark theme optimized

<!-- Nicolas Larenas, nlarchive -->
