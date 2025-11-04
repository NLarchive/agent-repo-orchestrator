describe('logger transports based on NODE_ENV', () => {
  const loggerPath = require.resolve('../../config/logger');
  const envPath = require.resolve('../../config/env');
  let origEnv;

  beforeEach(() => {
    // preserve original environment and ensure a clean module cache
    origEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    // restore NODE_ENV and clear cached modules so subsequent requires re-evaluate
    process.env.NODE_ENV = origEnv;
    delete require.cache[loggerPath];
    delete require.cache[envPath];
  });

  test('adds Console transport when not in production', () => {
    // mock the env module so logger uses the expected isProduction value
    jest.resetModules();
    jest.doMock('../../config/env', () => ({ log: { level: 'info' }, isProduction: false }));
    const logger = require('../../config/logger');

    const hasConsole = logger.transports.some(t => (t && t.constructor && t.constructor.name) === 'Console');
    expect(hasConsole).toBe(true);
  });

  test('does not add Console transport in production', () => {
    // mock the env module so logger uses the expected isProduction value
    jest.resetModules();
    jest.doMock('../../config/env', () => ({ log: { level: 'info' }, isProduction: true }));
    const logger = require('../../config/logger');

    const hasConsole = logger.transports.some(t => (t && t.constructor && t.constructor.name) === 'Console');
    expect(hasConsole).toBe(false);
  });
});

// Nicolas Larenas, nlarchive
