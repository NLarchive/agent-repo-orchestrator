const { loggingMiddleware, errorMiddleware } = require('../../api/middleware');
const logger = require('../../config/logger');

describe('API middleware', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('loggingMiddleware logs request on finish', done => {
    const req = { method: 'GET', path: '/test' };

    const finishHandlers = [];
    const res = {
      statusCode: 200,
      on: (ev, cb) => {
        if (ev === 'finish') finishHandlers.push(cb);
      }
    };

    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});

    loggingMiddleware(req, res, () => {
      // simulate later finish
      process.nextTick(() => {
        // call the registered finish handlers
        finishHandlers.forEach(fn => fn());
        try {
          expect(infoSpy).toHaveBeenCalled();
          const [msg, meta] = infoSpy.mock.calls[0];
          expect(msg).toMatch(/HTTP request/);
          expect(meta).toMatchObject({ method: 'GET', path: '/test', status: 200 });
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });

  test('errorMiddleware logs error and responds with 500 and message in dev', () => {
    const req = { path: '/err' };
    const err = new Error('boom');

    const jsonMock = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json: jsonMock })
    };

    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    errorMiddleware(err, req, res, () => {});

    expect(errorSpy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Internal server error',
      message: 'boom'
    }));

    process.env.NODE_ENV = origNodeEnv;
  });

  test('errorMiddleware hides message in non-development env', () => {
    const req = { path: '/err' };
    const err = new Error('boom');

    const jsonMock = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json: jsonMock })
    };

    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    errorMiddleware(err, req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Internal server error',
      message: 'An error occurred'
    }));

    process.env.NODE_ENV = origNodeEnv;
  });
});

// Nicolas Larenas, nlarchive
