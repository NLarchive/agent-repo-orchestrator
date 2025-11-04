jest.mock('nats', () => {
  return {
    JSONCodec: () => ({ encode: v => Buffer.from(JSON.stringify(v)), decode: b => JSON.parse(Buffer.from(b).toString()) }),
    consumerOpts: () => {
      const obj = {};
      obj.deliverNew = () => obj;
      obj.manualAck = () => obj;
      obj.durable = () => obj;
      obj.ackExplicit = () => obj;
      obj.bindStream = () => obj;
      return obj;
    }
  };
});

const NatsWrapper = require('../../plugins/nats-wrapper');

describe('NatsWrapper JetStream publish/subscribe', () => {
  test('publish uses JetStream when available', async () => {
    const wrapper = new NatsWrapper({});

    // stub JetStream publish
    const publishSpy = jest.fn().mockResolvedValue({ seq: 42 });
    wrapper.js = { publish: publishSpy };
    // connection object must exist
    wrapper.nc = {};

    const res = await wrapper.publish({ subject: 'test.subject', message: { hello: 'world' } });
    expect(res).toMatchObject({ success: true, subject: 'test.subject', messageId: 42 });
    expect(publishSpy).toHaveBeenCalled();
  });

  test('subscribe uses JetStream path and ack on success', async () => {
    const wrapper = new NatsWrapper({});

    // prepare a message and async iterable
    const ackSpy = jest.fn();
    const nakSpy = jest.fn();
    const msg = {
      data: new TextEncoder().encode(JSON.stringify({ event: 'evt', data: 'ok' })),
      ack: ackSpy,
      nak: nakSpy
    };

    const asyncIter = (async function* () {
      yield msg;
    })();

    wrapper.js = {
      subscribe: jest.fn().mockImplementation(() => asyncIter)
    };
    // connection object must exist
    wrapper.nc = {};
    wrapper.jsm = {}; // presence makes code go JetStream branch

    const cbPromise = new Promise((resolve, reject) => {
      const cb = (err, data) => {
        try {
          expect(err).toBeNull();
          expect(data).toMatchObject({ event: 'evt', data: 'ok' });
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      // call subscribe; internals will invoke the callback
      wrapper.subscribe('test.subject', cb).catch(reject);
    });

    await cbPromise;
    // allow microtask queue to flush so ack() (called after await callback) runs
    await new Promise(resolve => setImmediate(resolve));
    expect(ackSpy).toHaveBeenCalled();
  });
});

// Nicolas Larenas, nlarchive
