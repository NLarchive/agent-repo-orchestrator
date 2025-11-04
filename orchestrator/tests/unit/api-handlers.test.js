const request = require('supertest');
const express = require('express');
const DatabaseClient = require('../../db/client');
const WorkflowEngine = require('../../engine/workflow-engine');
const { createRouter } = require('../../api/router');

describe('API Handlers', () => {
  let app;
  let db;
  let engine;

  beforeAll(() => {
    db = new DatabaseClient(':memory:');
    db.connect();
    db.initialize();

    engine = new WorkflowEngine(db);
    // start engine so health endpoint reports running
    engine.start();

    app = express();
    app.use(express.json());
    app.use('/api', createRouter(db, engine));
  });

  afterAll(() => {
    engine.stop();
    db.close();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /api/plugins', () => {
    it('should register a plugin', async () => {
      const plugin = {
        id: 'test.plugin',
        name: 'Test Plugin',
        image: 'test:latest',
        version: '1.0.0'
      };

      const response = await request(app)
        .post('/api/plugins')
        .send(plugin);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Plugin registered');
    });

    it('should reject invalid plugin', async () => {
      const response = await request(app)
        .post('/api/plugins')
        .send({ name: 'Invalid' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/plugins', () => {
    beforeEach(async () => {
      db.createPlugin({
        id: 'p1',
        name: 'Plugin 1',
        image: 'p1:latest',
        version: '1.0'
      });
    });

    it('should list all plugins', async () => {
      const response = await request(app).get('/api/plugins');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('plugins');
      expect(Array.isArray(response.body.plugins)).toBe(true);
    });
  });

  describe('GET /api/plugins/:pluginId', () => {
    it('should get plugin by ID', async () => {
      db.createPlugin({
        id: 'get-test.plugin',
        name: 'Test Plugin',
        image: 'test:latest',
        version: '1.0'
      });

      const response = await request(app).get('/api/plugins/get-test.plugin');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'get-test.plugin');
    });

    it('should return 404 for non-existent plugin', async () => {
      const response = await request(app).get('/api/plugins/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/workflows', () => {
    it('should submit a workflow', async () => {
      db.createPlugin({
        id: 'workflow.plugin',
        name: 'Test Plugin',
        image: 'test:latest',
        version: '1.0',
        spec: { exposes: ['fetch'] }
      });


      const workflow = {
        name: 'test-workflow',
        steps: [
          {
            id: 'fetch',
            plugin: 'workflow.plugin',
            action: 'fetch',
            input: { url: 'https://example.com' }
          }
        ]
      };

      const response = await request(app)
        .post('/api/workflows')
        .send(workflow);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('executionId');
      expect(response.body).toHaveProperty('workflowId');
    });

    it('should reject invalid workflow', async () => {
      const response = await request(app)
        .post('/api/workflows')
        .send({ name: 'invalid' });

      expect(response.status).toBe(400);
    });

    it('should reject workflow with cycle', async () => {
      db.createPlugin({
        id: 'cycle.plugin',
        name: 'Cycle Plugin',
        image: 'test:latest',
        version: '1.0',
        spec: { exposes: ['fetch'] }
      });

      const workflow = {
        name: 'cyclic',
        steps: [
          { id: 'a', plugin: 'cycle.plugin', action: 'fetch', needs: ['b'] },
          { id: 'b', plugin: 'cycle.plugin', action: 'fetch', needs: ['a'] }
        ]
      };

      const response = await request(app)
        .post('/api/workflows')
        .send(workflow);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Cycle');
    });
  });

  describe('GET /api/executions/:executionId', () => {
    it('should get execution status', async () => {
      db.createWorkflow({ id: 'wf-1', name: 'Test', spec: { steps: [] } });
      db.createExecution({ id: 'exec-1', workflow_id: 'wf-1' });

      const response = await request(app).get('/api/executions/exec-1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', 'exec-1');
      expect(response.body).toHaveProperty('tasks');
      expect(response.body).toHaveProperty('events');
    });

    it('should return 404 for non-existent execution', async () => {
      const response = await request(app).get('/api/executions/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/stats', () => {
    it('should return statistics', async () => {
      const response = await request(app).get('/api/stats');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('queue');
      expect(response.body).toHaveProperty('executions');
    });
  });
});

// Nicolas Larenas, nlarchive
