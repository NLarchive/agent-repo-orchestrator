const NatsWrapper = require('../../plugins/nats-wrapper');
const nats = require('nats');
jest.mock('nats');

describe('NatsWrapper', () => {
  let wrapper;

  beforeEach(() => {
    wrapper = new NatsWrapper({ url: 'nats://localhost:4222' });
  });

  it('should throw if not connected on publish', async () => {
    await expect(wrapper.publish({ subject: 'test', message: 'msg' })).rejects.toThrow('NATS not connected');
  });

  it('should throw if not connected on subscribe', async () => {
    await expect(wrapper.subscribe('test', jest.fn())).rejects.toThrow('NATS not connected');
  });

  // Add more tests for JetStream stream creation, consumer options, fallback, error handling, etc.
});

// Nicolas Larenas, nlarchive
