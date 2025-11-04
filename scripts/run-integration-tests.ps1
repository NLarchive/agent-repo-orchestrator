#!/usr/bin/env pwsh
# run-integration-tests.ps1
# Orchestrator Stack A & B Integration Test Runner

$ErrorActionPreference = "Stop"

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Orchestrator Stack A & B Integration Test Runner         ║" -ForegroundColor Cyan
Write-Host "║  Messaging + Data + Databases                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker not found. Please install Docker." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker installed" -ForegroundColor Green

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    exit 1
}
$nodeVersion = node --version
Write-Host "✅ Node.js $nodeVersion installed" -ForegroundColor Green

# Check npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ npm not found. Please install npm" -ForegroundColor Red
    exit 1
}
Write-Host "✅ npm installed" -ForegroundColor Green

Write-Host ""

# Step 1: Install dependencies
Write-Host "📦 Installing npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green

Write-Host ""

# Step 2: Start Docker services
Write-Host "🐳 Starting Docker Compose services..." -ForegroundColor Yellow
docker-compose down -v 2>$null  # Clean up any previous runs
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker Compose failed to start" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker Compose services started" -ForegroundColor Green

Write-Host ""

# Step 3: Wait for services to be healthy
Write-Host "⏳ Waiting for services to be healthy (30 seconds)..." -ForegroundColor Yellow

$maxAttempts = 30
$attempt = 0
$allHealthy = $false

while ($attempt -lt $maxAttempts -and -not $allHealthy) {
    $attempt++
    
    # Check NATS
    try {
        $natsHealth = (Invoke-WebRequest -Uri "http://localhost:8222/varz" -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode -eq 200
    } catch {
        $natsHealth = $false
    }
    
    # Check PostgreSQL (via docker)
    try {
        $pgHealth = (docker exec orchestrator-postgres pg_isready -U orchestrator_user 2>$null) -like "*accepting*"
    } catch {
        $pgHealth = $false
    }
    
    # Check MinIO
    try {
        $minioHealth = (Invoke-WebRequest -Uri "http://localhost:9000/minio/health/live" -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode -eq 200
    } catch {
        $minioHealth = $false
    }
    
    # Check Pathway (optional, may not be ready immediately)
    try {
        $pathwayHealth = (Invoke-WebRequest -Uri "http://localhost:8000/health" -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode -eq 200
    } catch {
        $pathwayHealth = $false
    }
    
    $allHealthy = $natsHealth -and $pgHealth -and $minioHealth
    
    if ($allHealthy) {
        Write-Host "✅ All services are healthy" -ForegroundColor Green
    } else {
        Write-Host "  Attempt $attempt/30: NATS=$natsHealth, PostgreSQL=$pgHealth, MinIO=$minioHealth, Pathway=$pathwayHealth" -ForegroundColor Gray
        Start-Sleep -Seconds 1
    }
}

if (-not $allHealthy) {
    Write-Host "❌ Services did not become healthy in time" -ForegroundColor Red
    Write-Host "   Check docker-compose logs:" -ForegroundColor Yellow
    docker-compose logs --tail=20
    exit 1
}

Write-Host ""

# Step 4: Show service status
Write-Host "📊 Service Status:" -ForegroundColor Yellow
docker-compose ps

Write-Host ""

# Step 5: Run integration tests
Write-Host "🧪 Running integration tests..." -ForegroundColor Yellow
Write-Host ""

npm run test:integration

$testResult = $LASTEXITCODE

Write-Host ""

if ($testResult -eq 0) {
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  ✅ ALL INTEGRATION TESTS PASSED!                         ║" -ForegroundColor Green
    Write-Host "║                                                            ║" -ForegroundColor Green
    Write-Host "║  Stack A (Real-Time):                                     ║" -ForegroundColor Green
    Write-Host "║  NATS → Pathway → PostgreSQL + MinIO ✅                   ║" -ForegroundColor Green
    Write-Host "║                                                            ║" -ForegroundColor Green
    Write-Host "║  Stack B (Batch):                                         ║" -ForegroundColor Green
    Write-Host "║  Pathway → PostgreSQL + DuckDB + MinIO ✅                 ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "📚 Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Review QUICK_START.md for manual testing"
    Write-Host "  2. Review STACK_RECOMMENDATIONS.md for tech details"
    Write-Host "  3. Review INTEGRATION_SUMMARY.md for architecture"
    Write-Host "  4. Explore plugin code: orchestrator/plugins/"
    Write-Host "  5. View service logs: docker-compose logs -f [service-name]"
    Write-Host ""
    
    Write-Host "🚀 Services are running. Access them at:" -ForegroundColor Cyan
    Write-Host "  • NATS Monitor: http://localhost:8222"
    Write-Host "  • MinIO Console: http://localhost:9001 (minioadmin/minioadmin_password)"
    Write-Host "  • PostgreSQL: localhost:5432 (orchestrator_user/orchestrator_password)"
    Write-Host "  • Pathway: http://localhost:8000"
    Write-Host "  • Orchestrator: http://localhost:3000"
    Write-Host ""
    
    Write-Host "🛑 To stop services:" -ForegroundColor Yellow
    Write-Host "  docker-compose down -v"
    Write-Host ""
} else {
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║  ❌ INTEGRATION TESTS FAILED                              ║" -ForegroundColor Red
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Red
    
    Write-Host ""
    Write-Host "📊 Debugging Information:" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "1️⃣  Docker Compose Status:" -ForegroundColor Cyan
    docker-compose ps
    
    Write-Host ""
    Write-Host "2️⃣  Recent Logs:" -ForegroundColor Cyan
    docker-compose logs --tail=50
    
    Write-Host ""
    Write-Host "3️⃣  Service Health:" -ForegroundColor Cyan
    Write-Host "  NATS health: $(try { (Invoke-WebRequest -Uri 'http://localhost:8222/varz' -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode } catch { 'FAILED' })"
    
    Write-Host ""
    Write-Host "💡 Tips:" -ForegroundColor Yellow
    Write-Host "  • Check docker-compose logs for error messages"
    Write-Host "  • Verify all ports are available (3000,4222,5432,9000,8000)"
    Write-Host "  • Try: docker-compose down -v && docker-compose up -d"
    Write-Host "  • Review QUICK_START.md for troubleshooting"
    Write-Host ""
    
    exit 1
}

# Nicolas Larenas, nlarchive
