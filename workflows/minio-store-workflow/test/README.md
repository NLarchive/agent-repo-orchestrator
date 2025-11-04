# MinIO Store Workflow Tests

This folder contains tests to validate the functionality, reliability, and performance of the MinIO Store Workflow.

## Test Categories

### Integration Tests

#### `workflow-execution.test.js`
**Purpose**: Validates complete workflow execution from start to finish.

**Test Cases**:
- Successful workflow submission and execution
- All steps complete without errors
- Output artifacts generated correctly
- MinIO storage contains expected results

**Validation Criteria**:
- Workflow status: completed
- MinIO object exists at expected key
- PostgreSQL contains audit log entry
- Local output file matches MinIO content

#### `service-integration.test.js`
**Purpose**: Tests integration with individual services.

**Test Cases**:
- Pathway service connectivity and pipeline execution
- MinIO bucket creation and object upload/download
- PostgreSQL connection and data insertion
- Error handling when services are unavailable

### Performance Tests

#### `execution-time.test.js`
**Purpose**: Measures and validates workflow execution performance.

**Metrics**:
- Average execution time: < 10 seconds
- 95th percentile: < 15 seconds
- Memory usage: < 100MB
- CPU utilization: < 50%

#### `scalability.test.js`
**Purpose**: Tests workflow behavior under load.

**Test Cases**:
- Concurrent workflow executions
- Large data processing (1000+ records)
- Network latency simulation
- Service degradation scenarios

### Reliability Tests

#### `error-recovery.test.js`
**Purpose**: Validates error handling and recovery mechanisms.

**Test Cases**:
- Service temporarily unavailable
- Network connectivity issues
- Invalid input data
- Resource exhaustion scenarios

**Recovery Validation**:
- Automatic retry logic works
- Partial failures don't corrupt data
- Error states are properly logged
- Cleanup occurs on failures

#### `data-integrity.test.js`
**Purpose**: Ensures data consistency throughout the workflow.

**Test Cases**:
- Data transformation accuracy
- No data loss during processing
- Audit trail completeness
- Output matches input expectations

## Test Execution

### Running Tests
```bash
# Run all tests for this workflow
cd workflows/minio-store-workflow/test
npm test

# Run specific test category
npm run test:integration
npm run test:performance
npm run test:reliability
```

### Test Environment Setup
```bash
# Start required services
docker-compose up -d nats postgres minio pathway

# Run workflow tests
cd workflows/minio-store-workflow
node ../../common/run-local-e2e.js workflow.json
```

## Test Results and Metrics

### Success Criteria
- **Test Pass Rate**: >95% for all test categories
- **Performance Benchmarks**: Meet or exceed target metrics
- **Reliability Score**: >99.5% successful executions
- **Data Accuracy**: 100% match between input and output

### Monitoring
- Test execution logs in `test-results.log`
- Performance metrics in `performance-metrics.json`
- Coverage reports in `coverage/` directory

## Continuous Integration

### Automated Testing
- Tests run on every code change
- Performance regression detection
- Integration test failures block deployments
- Daily reliability testing in staging environment

### Quality Gates
- Code coverage >80%
- No critical security vulnerabilities
- Performance benchmarks met
- All integration tests passing

## Test Data

### Sample Input Data
```json
{
  "pipelineId": "sample-pipeline",
  "input": {
    "data": "sample input data",
    "format": "json"
  }
}
```

### Expected Output
```json
{
  "success": true,
  "executionId": "exec_20251031120000",
  "status": "completed",
  "result": {
    "processedData": "...",
    "metadata": {
      "recordsProcessed": 100,
      "executionTime": "5.2s"
    }
  }
}
```

## Maintenance

### Test Updates
- Update tests when workflow logic changes
- Add new test cases for new features
- Review and update performance benchmarks quarterly
- Validate tests against production deployments

### Troubleshooting
- Check service logs for integration failures
- Verify test data matches production schemas
- Monitor resource usage during test execution
- Review network connectivity for external services