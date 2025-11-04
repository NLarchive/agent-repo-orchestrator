const request = require('supertest');
const express = require('express');
const DatabaseClient = require('../../db/client');
const WorkflowEngine = require('../../engine/workflow-engine');
const { createRouter } = require('../../api/router');

describe('Health endpoint', () => {
  let app;
  let db;
  let engine;

  beforeAll(() => {
    db = new DatabaseClient(':memory:');
    db.connect();
    db.initialize();

    engine = new WorkflowEngine(db);
    // start the engine so health endpoint shows running
    engine.start();

    app = express();
    app.use(express.json());
    app.use('/api', createRouter(db, engine));
  });

  afterAll(() => {
    engine.stop();
    db.close();
  });

  it('GET /api/health returns ok status and timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    // timestamp should be an ISO timestamp string
    expect(() => new Date(res.body.timestamp)).not.toThrow();
  });
});

// Nicolas Larenas, nlarchive
