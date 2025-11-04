const PostgresWrapper = require('../../plugins/postgres-wrapper');

describe('PostgresWrapper negative paths', () => {
  test('validateTableName rejects invalid names', () => {
    const w = new PostgresWrapper();
    expect(() => w.validateTableName('123bad')).toThrow(/Invalid table name/);
    // semicolon will fail the pattern check first — accept any thrown error for dangerous-looking input
    expect(() => w.validateTableName('good;DROP')).toThrow();
    expect(() => w.validateTableName('bad/name')).toThrow(/Invalid table name/);
  });

  test('query throws when not connected', async () => {
    const w = new PostgresWrapper();
    await expect(w.query('SELECT 1')).rejects.toThrow('PostgreSQL not connected');
  });

  test('insert/select/update throw when not connected', async () => {
    const w = new PostgresWrapper();
    await expect(w.insert('events', { a: 1 })).rejects.toThrow('PostgreSQL not connected');
    await expect(w.select('events')).rejects.toThrow('PostgreSQL not connected');
    await expect(w.update('events', { a: 2 }, { id: 1 })).rejects.toThrow('PostgreSQL not connected');
  });

  test('getHealth returns unhealthy when query fails', async () => {
    const w = new PostgresWrapper({ retries: 0 });
    // simulate connected but query throws
    w.sql = { unsafe: jest.fn().mockRejectedValue(new Error('boom')) };
    const res = await w.getHealth();
    expect(res).toMatchObject({ status: 'unhealthy', connected: false });
  });
});

// Nicolas Larenas, nlarchive
