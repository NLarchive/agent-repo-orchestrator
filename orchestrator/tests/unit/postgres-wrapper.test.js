const PostgresWrapper = require('../../plugins/postgres-wrapper');

describe('PostgresWrapper', () => {
  let wrapper;

  beforeEach(() => {
    wrapper = new PostgresWrapper({
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test'
    });
  });

  it('should throw if not connected on query', async () => {
    // wrapper.query throws when the client is not connected; match on 'not connected' to be permissive
    await expect(wrapper.query('SELECT 1')).rejects.toThrow(/not connected/i);
  });

  // Add more tests for invalid table names, query/insert/select/update errors, health check failures
});

// Nicolas Larenas, nlarchive
