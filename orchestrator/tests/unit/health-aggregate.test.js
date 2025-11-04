const request = require('supertest');
const express = require('express');
const { createRouter } = require('../../api/router');

describe('Health endpoint - aggregated checks', () => {
  let app;

  it('returns 200 when DB and engine are healthy', async () => {
    const fakeDb = {
      getExecutionStats: () => [{ status: 'pending', count: 1 }],
      getAllPlugins: () => [{ id: 'p1', name: 'Plugin 1', spec: {} }]
    };

    const fakeEngine = {
      isRunning: true,
      getStats: () => ({ queued: 0 })
    };

    app = express();
    app.use(express.json());
    app.use('/api', createRouter(fakeDb, fakeEngine));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('services');
    expect(res.body.services.db.status).toBe('ok');
    expect(res.body.services.engine.status).toBe('running');
    expect(Array.isArray(res.body.services.plugins)).toBe(true);
  });

  it('returns 503 when DB check throws', async () => {
    const fakeDb = {
      getExecutionStats: () => { throw new Error('DB offline'); },
      getAllPlugins: () => []
    };

    const fakeEngine = {
      isRunning: true,
      getStats: () => ({ queued: 0 })
    };

    app = express();
    app.use(express.json());
    app.use('/api', createRouter(fakeDb, fakeEngine));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.db.status).toBe('error');
  });

  it('returns 503 when engine not running', async () => {
    const fakeDb = {
      getExecutionStats: () => [{ status: 'pending', count: 1 }],
      getAllPlugins: () => []
    };

    const fakeEngine = {
      isRunning: false,
      getStats: () => ({ queued: 0 })
    };

    app = express();
    app.use(express.json());
    app.use('/api', createRouter(fakeDb, fakeEngine));

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.engine.status).toBe('stopped');
  });
});

// Nicolas Larenas, nlarchive
