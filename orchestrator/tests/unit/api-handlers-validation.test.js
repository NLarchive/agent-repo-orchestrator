const request = require('supertest');
const express = require('express');
const DatabaseClient = require('../../db/client');
const WorkflowEngine = require('../../engine/workflow-engine');
const { createRouter } = require('../../api/router');

describe('API Handlers - Workflow validation', () => {
  let app;
  let db;
  let engine;

  beforeAll(() => {
    db = new DatabaseClient(':memory:');
    db.connect();
    db.initialize();

    engine = new WorkflowEngine(db);

    app = express();
    app.use(express.json());
    app.use('/api', createRouter(db, engine));
  });

  afterAll(() => {
    engine.stop();
    db.close();
  });

  it('returns 400 when workflow body is not an object', async () => {
    // send an empty object (valid JSON) which should fail validation for missing name/steps
    const res = await request(app)
      .post('/api/workflows')
      .send({})
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    // Some error responses may serialize differently depending on middleware; accept either detailed JSON or plain text
    // Should report missing name and steps
    if (res.body && Array.isArray(res.body.details)) {
      expect(res.body.details).toEqual(expect.arrayContaining([
        'Workflow must have a string name',
        'Workflow must have an array of steps'
      ]));
    } else {
      expect(res.text).toMatch(/Workflow must have a string name|Workflow must have an array of steps/i);
    }
  });

  it('returns 400 when workflow has a cycle (engine validation)', async () => {
    // Create a minimal workflow that has a cycle: A needs B, B needs A
    const wf = {
      name: 'cycle-test',
      steps: [
        { id: 'a', plugin: 'p', action: 'run', needs: ['b'] },
        { id: 'b', plugin: 'p', action: 'run', needs: ['a'] }
      ]
    };

    const res = await request(app)
      .post('/api/workflows')
      .send(wf)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    // Handler catches engine error and returns the engine message in `message`
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toMatch(/Invalid workflow/i);
  });
});

// Nicolas Larenas, nlarchive
