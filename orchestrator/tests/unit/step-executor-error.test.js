const StepExecutor = require('../../engine/step-executor');
const DatabaseClient = require('../../db/client');
const axios = require('axios');
jest.mock('axios');

describe('StepExecutor Error Branches', () => {
  let db, executor;

  beforeEach(() => {
    db = new DatabaseClient(':memory:');
    db.connect();
    db.initialize();
    executor = new StepExecutor(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should throw on plugin not found', async () => {
    await expect(executor.execute({ plugin: 'missing', action: 'run' })).rejects.toThrow('Plugin not found');
  });

  // Add more tests for unexposed action, plugin call failures, retry/backoff, max retry fail
});

// Nicolas Larenas, nlarchive
