#!/usr/bin/env pwsh
<#
.SYNOPSIS
Alert Remediation Script - Handles firing alerts in Prometheus

.DESCRIPTION
Provides quick actions to investigate and remediate the active alerts:
- NATSNoConnections (2 instances)
- SlowBatchProcessing (1 instance)

.USAGE
./remediate-alerts.ps1 -Action silence
./remediate-alerts.ps1 -Action investigate
./remediate-alerts.ps1 -Action tune
#>

param(
    [ValidateSet("investigate", "silence", "tune", "status")]
    [string]$Action = "status"
)

$PromURL = "http://localhost:9090"
$OrchestratorURL = "http://localhost:3000"
$NatsURL = "http://localhost:8222"

Write-Host "🔍 Alert Remediation Tool" -ForegroundColor Cyan
Write-Host "=" * 50

function Get-AlertStatus {
    Write-Host "`n📊 Checking Alert Status..." -ForegroundColor Yellow
    
    try {
        $response = Invoke-RestMethod "$PromURL/api/v1/alerts" -ErrorAction Stop
        $alerts = $response.data.alerts
        
        $firing = $alerts | Where-Object { $_.state -eq 'firing' }
        
        Write-Host "`nFiring Alerts: $($firing.Count)" -ForegroundColor Red
        
        foreach ($alert in $firing) {
            Write-Host "`n  Alert: $($alert.labels.alertname)" -ForegroundColor Red
            Write-Host "    Severity: $($alert.labels.severity)"
            Write-Host "    Instances: $($alert.labels.instance)"
            Write-Host "    Duration: $($alert.activeAt)"
            Write-Host "    Value: $($alert.value)"
        }
        
        return $firing
    }
    catch {
        Write-Host "❌ Failed to fetch alerts: $_" -ForegroundColor Red
        return $null
    }
}

function Investigate-Alerts {
    Write-Host "`n🔎 Investigating Alerts..." -ForegroundColor Yellow
    
    # Check NATS status
    Write-Host "`n📡 NATS Server Status:" -ForegroundColor Cyan
    try {
        $natsStats = Invoke-RestMethod "$NatsURL/varz" -ErrorAction Stop
        Write-Host "  Connections:       $($natsStats.connections)" -ForegroundColor $(if ($natsStats.connections -eq 0) { 'Red' } else { 'Green' })
        Write-Host "  Subscriptions:     $($natsStats.subscriptions)"
        Write-Host "  Uptime:            $($natsStats.uptime)"
        Write-Host "  Total Connections: $($natsStats.total_connections)"
        
        if ($natsStats.connections -eq 0) {
            Write-Host "`n  ⚠️  No active connections - this is normal for idle state" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "  ❌ Failed to connect to NATS: $_" -ForegroundColor Red
    }
    
    # Check Orchestrator metrics
    Write-Host "`n📊 Orchestrator Metrics:" -ForegroundColor Cyan
    try {
        $metrics = Invoke-RestMethod "$OrchestratorURL/metrics" -ErrorAction Stop
        $lines = $metrics -split "`n"
        
        $batchMetrics = $lines | Where-Object { $_ -match 'batch_processing' -and $_ -notmatch '^#' }
        if ($batchMetrics.Count -gt 0) {
            Write-Host "  Found batch processing metrics:" -ForegroundColor Green
            $batchMetrics | ForEach-Object { Write-Host "    $_" }
        } else {
            Write-Host "  No batch processing metrics found" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "  ❌ Failed to fetch metrics: $_" -ForegroundColor Red
    }
    
    # Check mock-streamer status
    Write-Host "`n🎬 Mock Streamer Status:" -ForegroundColor Cyan
    try {
        $streamerStatus = Invoke-RestMethod "$OrchestratorURL/api/streamers/status" -ErrorAction Stop 2>$null
        Write-Host "  Status: $($streamerStatus.status)" -ForegroundColor Green
        Write-Host "  Details: $($streamerStatus | ConvertTo-Json -Depth 2)"
    }
    catch {
        Write-Host "  Could not fetch streamer status (endpoint may not exist)" -ForegroundColor Yellow
    }
}

function Silence-Alerts {
    Write-Host "`n🔇 Silencing Alerts..." -ForegroundColor Yellow
    
    Write-Host "`n📢 To silence alerts manually:" -ForegroundColor Cyan
    Write-Host "  1. Open: $PromURL/alerts"
    Write-Host "  2. Click on each firing alert"
    Write-Host "  3. Select 'Silences' → 'Create Silence'"
    Write-Host "  4. Set duration and reason"
    
    Write-Host "`n⚠️  Note: Silencing temporarily hides alerts but doesn't fix the issue"
    Write-Host "   Please investigate root cause using 'investigate' action"
}

function Tune-Alerts {
    Write-Host "`n🎚️  Alert Tuning Recommendations..." -ForegroundColor Yellow
    
    Write-Host "`n1️⃣  For NATSNoConnections Alert:" -ForegroundColor Cyan
    Write-Host "   Current: Fires when connections == 0 for 5m"
    Write-Host "   Recommended: Only fire when truly disconnected unexpectedly"
    Write-Host ""
    Write-Host "   Option A: Increase wait time to 15 minutes"
    Write-Host "   Option B: Add condition for sustained disconnection"
    Write-Host "   Option C: Adjust severity/messaging (expected in idle state)"
    
    Write-Host "`n2️⃣  For SlowBatchProcessing Alert:" -ForegroundColor Cyan
    Write-Host "   Current: Fires when P95 > 30s for 5m"
    Write-Host "   Value:   Currently 57.21s"
    Write-Host ""
    Write-Host "   Option A: Increase threshold to 60s"
    Write-Host "   Option B: Investigate batch processing performance"
    Write-Host "   Option C: Add rate-of-change detection instead of absolute threshold"
    
    Write-Host "`n📝 To apply changes:" -ForegroundColor Yellow
    Write-Host "   1. Edit: prometheus-alerts.yml"
    Write-Host "   2. Update alert conditions"
    Write-Host "   3. Reload: docker-compose restart prometheus"
    Write-Host "   4. Verify: $PromURL/api/v1/rules"
}

function Show-Status {
    Write-Host "`n📈 System Status:" -ForegroundColor Cyan
    
    # Check Docker containers
    Write-Host "`n🐳 Container Status:" -ForegroundColor Cyan
    $containers = docker-compose ps --services 2>$null
    if ($containers) {
        Write-Host "  ✅ Docker Compose is running"
        Write-Host "  Services: $($containers -join ', ')"
    } else {
        Write-Host "  ❌ Docker Compose not running" -ForegroundColor Red
    }
    
    # Check Prometheus
    Write-Host "`n🔥 Prometheus Status:" -ForegroundColor Cyan
    try {
        $promStatus = Invoke-RestMethod "$PromURL/-/ready" -ErrorAction Stop
        Write-Host "  ✅ Prometheus: Ready"
    }
    catch {
        Write-Host "  ⚠️  Prometheus: Not responding" -ForegroundColor Yellow
    }
    
    Get-AlertStatus
}

# Execute action
switch ($Action) {
    "status" { Show-Status }
    "investigate" { 
        Get-AlertStatus
        Investigate-Alerts 
    }
    "silence" { Silence-Alerts }
    "tune" { Tune-Alerts }
    default { Show-Status }
}

Write-Host "`n" + "=" * 50
Write-Host "✨ Remediation Script Complete" -ForegroundColor Green

# Nicolas Larenas, nlarchive
