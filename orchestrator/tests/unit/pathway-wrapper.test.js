const PathwayWrapper = require('../../plugins/pathway-wrapper');

describe('PathwayWrapper basic operations', () => {
  test('runPipeline returns success on post', async () => {
    const wrapper = new PathwayWrapper({ baseUrl: 'http://localhost:8000' });

    // stub axios post
    wrapper.client.post = jest.fn().mockResolvedValue({ data: { executionId: 'exec-1', status: 'running' } });

    const res = await wrapper.runPipeline({ pipelineId: 'pipeline-1', input: { foo: 'bar' } });
    expect(res).toMatchObject({ success: true, executionId: 'exec-1', status: 'running', pipelineId: 'pipeline-1' });
    expect(wrapper.client.post).toHaveBeenCalledWith('/pipelines/pipeline-1/run', expect.any(Object));
  });

  test('getHealth returns unhealthy on fetch error', async () => {
    const wrapper = new PathwayWrapper({ baseUrl: 'http://localhost:8000' });
    wrapper.client.get = jest.fn().mockRejectedValue(new Error('network fail'));

    const res = await wrapper.getHealth();
    expect(res).toMatchObject({ status: 'unhealthy' });
  });

  test('getPipelineStatus and listPipelines return expected data', async () => {
    const wrapper = new PathwayWrapper({ baseUrl: 'http://localhost:8000' });
    wrapper.client.get = jest.fn()
      .mockResolvedValueOnce({ data: { status: 'running', progress: 50, result: null, error: null } })
      .mockResolvedValueOnce({ data: [{ id: 'p1' }, { id: 'p2' }] });

    const status = await wrapper.getPipelineStatus('p1', 'exec1');
    expect(status).toMatchObject({ status: 'running', pipelineId: 'p1' });

    const list = await wrapper.listPipelines();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
  });

  test('cancelPipeline returns success on post', async () => {
    const wrapper = new PathwayWrapper({ baseUrl: 'http://localhost:8000' });
    wrapper.client.post = jest.fn().mockResolvedValue({ data: { ok: true } });

    const res = await wrapper.cancelPipeline('p1', 'exec1');
    expect(res).toMatchObject({ success: true, executionId: 'exec1' });
  });
});

// Nicolas Larenas, nlarchive
