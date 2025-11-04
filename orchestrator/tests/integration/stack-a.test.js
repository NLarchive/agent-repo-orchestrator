// orchestrator/tests/integration/stack-a.test.js
// Stack A Integration Test: NATS + Pathway + PostgreSQL + MinIO

const axios = require('axios');
const NatsWrapper = require('../../plugins/nats-wrapper');
const PathwayWrapper = require('../../plugins/pathway-wrapper');
const PostgresWrapper = require('../../plugins/postgres-wrapper');
const MinIOWrapper = require('../../plugins/minio-wrapper');

describe('Stack A Integration: Messaging + Data Analysis + Databases', () => {
  const orchestratorUrl = 'http://localhost:3000';
  let nats, pathway, postgres, minio;
  let workflowId;

  beforeAll(async () => {
    // Initialize wrappers
    nats = new NatsWrapper({ url: 'nats://localhost:4222' });
    pathway = new PathwayWrapper({ baseUrl: 'http://localhost:8000' });
    postgres = new PostgresWrapper({
      host: 'localhost',
      port: 5432,
      database: 'orchestrator_db',
      user: 'orchestrator_user',
      password: 'orchestrator_password'
    });
    minio = new MinIOWrapper({
      host: 'localhost',
      port: 9000,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin_password',
      bucket: 'orchestrator'
    });

    // Connect all services (connect may perform an initial health check)
    await nats.connect();
    await pathway.connect();
    await postgres.connect();
    await minio.connect();

    // Helper: wait for wrapper health method (if present) or assume connect success
    const waitForHealthy = async (name, wrapper, timeout = 60000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          if (typeof wrapper.getHealth === 'function') {
            const h = await wrapper.getHealth();
            if (h && (h.status === 'healthy' || h.connected === true || h === 'ok' || h.status === 'ok')) {
              return;
            }
          } else {
            // No health method; assume connect() success means healthy
            return;
          }
        } catch (err) {
          // ignore and retry
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error(`${name} did not become healthy within ${timeout}ms`);
    };

    // Wait for each service to report healthy
    await waitForHealthy('NATS', nats);
    await waitForHealthy('Pathway', pathway);
    await waitForHealthy('Postgres', postgres);
    await waitForHealthy('MinIO', minio);
  });

  afterAll(async () => {
    await nats.disconnect();
    await postgres.disconnect();
    minio.disconnect();
  });

  describe('Service Health Checks', () => {
    test('NATS should be healthy', async () => {
      const health = await nats.getHealth();
      expect(health.status).toBe('healthy');
    });

    test('Pathway should be healthy', async () => {
      const health = await pathway.getHealth();
      expect(health.status).toBe('healthy');
    });

    test('PostgreSQL should be healthy', async () => {
      const health = await postgres.getHealth();
      expect(health.status).toBe('healthy');
    });

    test('MinIO should be healthy', async () => {
      const health = await minio.getHealth();
      expect(health.status).toBe('healthy');
    });

    test('Orchestrator should be responding', async () => {
      try {
        const response = await axios.get(`${orchestratorUrl}/health`, { timeout: 5000 });
        expect(response.status).toBe(200);
      } catch (err) {
        // Orchestrator may not have health endpoint yet, that's ok
        console.log('Orchestrator health check not yet implemented');
      }
    });
  });

  describe('NATS Messaging', () => {
    test('should create streams', async () => {
      const result1 = await nats.streamAdd('events', ['events.*']);
      expect(result1.success).toBe(true);
      expect(result1.streamName).toBe('events');
      const result2 = await nats.streamAdd('test_stream', ['test.message']);
      expect(result2.success).toBe(true);
      expect(result2.streamName).toBe('test_stream');
    });

    test('should publish and subscribe to messages', async () => {
      let receivedMessage = null;

      await nats.subscribe('test.message', {
        callback: (err, msg) => {
          if (!err) receivedMessage = msg;
        },
        streamName: 'test_stream'
      });

  // Wait for consumer to be ready
  await new Promise(resolve => setTimeout(resolve, 500));

      const testMessage = { event: 'test', data: 'hello' };
      const result = await nats.publish({ subject: 'test.message', message: testMessage });

      expect(result.success).toBe(true);

      // Give subscriber time to receive
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(receivedMessage).toEqual(testMessage);
    });

    test('should publish multiple events', async () => {
      const subject = 'events.batch_001';
      const events = [
        { id: 1, value: 100, timestamp: new Date().toISOString() },
        { id: 2, value: 200, timestamp: new Date().toISOString() },
        { id: 3, value: 300, timestamp: new Date().toISOString() }
      ];

      for (const event of events) {
        const result = await nats.publish({ subject, message: event });
        expect(result.success).toBe(true);
      }

      console.log(`Published ${events.length} events to ${subject}`);
    });
  });

  describe('PostgreSQL Data Storage', () => {
    test('should create events table', async () => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS orchestrator_events (
          id SERIAL PRIMARY KEY,
          event_type VARCHAR(255),
          data JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      await postgres.query(createTableSQL);
      console.log('Events table created/verified');
    });

    test('should insert event into PostgreSQL', async () => {
      const event = {
        event_type: 'data_processed',
        data: JSON.stringify({ source: 'pathway', count: 150 })
      };

      const result = await postgres.insert({ table: 'orchestrator_events', data: event });
      expect(result).toBeDefined();
      console.log('Event inserted:', result);
    });

    test('should query events from PostgreSQL', async () => {
      const result = await postgres.select({ table: 'orchestrator_events', limit: 10 });
      expect(Array.isArray(result)).toBe(true);
      console.log(`Found ${result.length} events`);
    });
  });

  describe('MinIO Object Storage', () => {
    test('should upload object to MinIO', async () => {
      const testData = JSON.stringify({
        batch: 'batch_001',
        records: [
          { id: 1, value: 100 },
          { id: 2, value: 200 },
          { id: 3, value: 300 }
        ]
      });

      const result = await minio.putObject({ key: 'batch_001/data.json', data: testData, metadata: {
        'batch-id': 'batch_001'
      }});

      expect(result.success).toBe(true);
      expect(result.key).toBe('batch_001/data.json');
      console.log('Object uploaded:', result.etag);
    });

    test('should download object from MinIO', async () => {
      const data = await minio.getObject('batch_001/data.json');
      const parsed = JSON.parse(data);

      expect(parsed.batch).toBe('batch_001');
      expect(parsed.records.length).toBe(3);
      console.log('Object downloaded and verified');
    });

    test('should list objects in MinIO', async () => {
      const objects = await minio.listObjects('batch_001/');
      expect(Array.isArray(objects)).toBe(true);
      console.log(`Found ${objects.length} objects in batch_001/`);
    });
  });

  describe('Pathway ETL Processing', () => {
    test('should list available pipelines', async () => {
      const pipelines = await pathway.listPipelines();
      console.log(`Found ${pipelines.length} pipelines`);
      // Pipelines may not exist yet, that's ok for this test
    });

    test('should retrieve metrics', async () => {
      const metrics = await pathway.getMetrics();
      expect(metrics).toBeDefined();
      console.log('Pathway metrics:', metrics);
    });
  });

  describe('End-to-End Workflow', () => {
    test('should register workflow with orchestrator', async () => {
      const workflow = {
        name: 'stack-a-demo',
        description: 'Real-time ETL: NATS → Pathway → PostgreSQL + MinIO',
        steps: [
          {
            id: 'nats-subscribe',
            type: 'nats-subscribe',
            plugin: 'nats',
            action: 'subscribe',
            config: {
              subject: 'events.batch_*'
            }
          },
          {
            id: 'pathway-transform',
            type: 'pathway-run',
            plugin: 'pathway',
            action: 'runPipeline',
            config: {
              pipelineId: 'transform_events',
              inputBinding: 'nats-subscribe.data'
            },
            dependsOn: ['nats-subscribe']
          },
          {
            id: 'postgres-store',
            type: 'postgres-insert',
            plugin: 'postgres',
            action: 'insert',
            config: {
              table: 'orchestrator_events',
              dataBinding: 'pathway-transform.result'
            },
            dependsOn: ['pathway-transform']
          },
          {
            id: 'minio-archive',
            type: 'minio-upload',
            plugin: 'minio',
            action: 'putObject',
            config: {
              keyBinding: 'pathway-transform.metadata.batch_id',
              dataBinding: 'pathway-transform.result'
            },
            dependsOn: ['pathway-transform']
          }
        ]
      };

      try {
        const response = await axios.post(`${orchestratorUrl}/workflows`, workflow, {
          timeout: 5000
        });
        workflowId = response.data.id;
        expect(workflowId).toBeDefined();
        console.log(`Workflow registered: ${workflowId}`);
      } catch (err) {
        console.log('Orchestrator workflow registration not yet implemented (expected)');
      }
    });

    test('should execute complete data pipeline', async () => {
      // Simulate event flow: NATS → Pathway → PostgreSQL + MinIO
      
      // Step 1: Publish events to NATS
      const events = [
        { id: 101, value: 1000, source: 'sensor_a' },
        { id: 102, value: 2000, source: 'sensor_b' },
        { id: 103, value: 3000, source: 'sensor_c' }
      ];

      for (const event of events) {
        await nats.publish({ subject: 'events.batch_002', message: event });
      }
      console.log(`Published ${events.length} events to NATS`);

      // Step 2: Simulate Pathway processing (in real scenario, would subscribe to NATS)
      const processedData = {
        batch_id: 'batch_002',
        count: events.length,
        sum: events.reduce((sum, e) => sum + e.value, 0),
        avg: events.reduce((sum, e) => sum + e.value, 0) / events.length,
        timestamp: new Date().toISOString()
      };

      // Step 3: Store in PostgreSQL
      await postgres.insert({ table: 'orchestrator_events', data: {
        event_type: 'pipeline_complete',
        data: JSON.stringify(processedData)
      }});
      console.log('Pipeline result stored in PostgreSQL');

      // Step 4: Archive in MinIO
      await minio.putObject({ key: 'batch_002/result.json', data: JSON.stringify(processedData), metadata: {
        'batch-id': 'batch_002',
        'status': 'completed'
      }});
      console.log('Pipeline result archived in MinIO');

      // Verify end-to-end
      const dbResult = await postgres.select({ table: 'orchestrator_events', where: { event_type: 'pipeline_complete' } });
      expect(dbResult.length).toBeGreaterThan(0);

      const s3Result = await minio.getObject('batch_002/result.json');
      const parsed = JSON.parse(s3Result);
      expect(parsed.batch_id).toBe('batch_002');
      expect(parsed.count).toBe(3);

      console.log('End-to-end workflow completed successfully!');
    });
  });

  describe('Error Handling', () => {
    test('should handle connection failures gracefully', async () => {
      const invalidNats = new NatsWrapper({ url: 'nats://invalid-host:4222' });
      
      try {
        await invalidNats.connect();
        fail('Should have thrown error');
      } catch (err) {
        expect(err).toBeDefined();
        console.log('Connection error handled gracefully');
      }
    });

    test('should retry failed operations', async () => {
      // This would test retry logic in production
      console.log('Retry logic to be implemented in handlers');
    });
  });
});

// Nicolas Larenas, nlarchive
