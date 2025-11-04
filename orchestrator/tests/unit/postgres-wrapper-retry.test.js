const PostgresWrapper = require('../../plugins/postgres-wrapper');

describe('PostgresWrapper retry logic', () => {
  it('retries transient failures and succeeds', async () => {
    const wrapper = new PostgresWrapper({ retries: 2, retryBaseDelay: 1 });

    // stub a sql client that fails once then succeeds
    const unsafe = jest.fn()
      .mockRejectedValueOnce(new Error('temporary error'))
      .mockResolvedValueOnce([{ id: 1 }]);

    wrapper.sql = { unsafe };

    const res = await wrapper.query('SELECT 1');
    expect(res).toEqual([{ id: 1 }]);
    expect(unsafe).toHaveBeenCalledTimes(2);
  });

  it('gives up after retries exhausted', async () => {
    const wrapper = new PostgresWrapper({ retries: 1, retryBaseDelay: 1 });
    const unsafe = jest.fn().mockRejectedValue(new Error('permanent error'));
    wrapper.sql = { unsafe };

    await expect(wrapper.query('SELECT 1')).rejects.toThrow('permanent error');
    expect(unsafe).toHaveBeenCalledTimes(2); // initial + 1 retry
  });
});

// Nicolas Larenas, nlarchive
