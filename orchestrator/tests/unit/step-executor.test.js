const StepExecutor = require('../../engine/step-executor');
const DatabaseClient = require('../../db/client');
const axios = require('axios');

jest.mock('axios');

describe('Step Executor', () => {
  let db;
  let executor;

  beforeEach(() => {
    jest.clearAllMocks();
    db = new DatabaseClient(':memory:');
    db.connect();
    db.initialize();

    // Create test plugin
    db.createPlugin({
      id: 'test.plugin',
      name: 'Test Plugin',
      image: 'test:latest',
      version: '1.0.0',
      spec: {
        id: 'test.plugin',
        ports: [8080],
        exposes: ['fetch', 'transform']
      }
    });

    executor = new StepExecutor(db);
  });

  afterEach(() => {
    jest.clearAllMocks();
    db.close();
  });

  describe('buildServiceUrl', () => {
    it('should build correct service URL', () => {
      const plugin = db.getPlugin('test.plugin');
      const url = executor.buildServiceUrl(plugin, 'fetch');
      
      expect(url).toMatch(/^http:\/\/test-plugin\.plugins\.svc\.cluster\.local:8080\/fetch$/);
    });
  });

  describe('resolveInput', () => {
    it('should resolve template with step result', () => {
      const input = {
        data: '{{ steps.fetch.result }}'
      };

      const context = {
        steps: {
          fetch: { result: { value: 'test-data' } }
        }
      };

      const resolved = executor.resolveInput(input, context);
      expect(resolved.data).toEqual({ value: 'test-data' });
    });

    it('should resolve nested template', () => {
      const input = {
        url: '{{ steps.fetch.result.url }}'
      };

      const context = {
        steps: {
          fetch: { result: { url: 'https://example.com' } }
        }
      };

      const resolved = executor.resolveInput(input, context);
      expect(resolved.url).toBe('https://example.com');
    });

    it('should leave non-template values unchanged', () => {
      const input = {
        static: 'value',
        number: 42
      };

      const resolved = executor.resolveInput(input, {});
      expect(resolved).toEqual(input);
    });

    it('should handle missing context gracefully', () => {
      const input = {
        data: '{{ steps.missing.result }}'
      };

      const resolved = executor.resolveInput(input, { steps: {} });
      expect(resolved.data).toBe('{{ steps.missing.result }}');
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      expect(executor.calculateBackoff(1, 'exponential')).toBe(2000);
      expect(executor.calculateBackoff(2, 'exponential')).toBe(4000);
      expect(executor.calculateBackoff(3, 'exponential')).toBe(8000);
    });

    it('should use fixed backoff by default', () => {
      expect(executor.calculateBackoff(1, 'fixed')).toBe(1000);
      expect(executor.calculateBackoff(5, 'fixed')).toBe(1000);
    });
  });

  describe('execute', () => {
    it('should successfully execute step', async () => {
      const mockResponse = {
        status: 200,
        data: { result: 'success' }
      };
      axios.post.mockResolvedValue(mockResponse);

      const step = {
        id: 'test-step',
        plugin: 'test.plugin',
        action: 'fetch',
        input: { url: 'https://example.com' }
      };

      const result = await executor.execute(step, {});
      
      expect(result).toEqual({ result: 'success' });
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/fetch'),
        { url: 'https://example.com' },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should throw on plugin not found', async () => {
      const step = {
        id: 'test-step',
        plugin: 'nonexistent',
        action: 'fetch'
      };

      await expect(executor.execute(step, {})).rejects.toThrow('Plugin not found');
    });

    it('should throw on unexposed action', async () => {
      const step = {
        id: 'test-step',
        plugin: 'test.plugin',
        action: 'unauthorized'
      };

      await expect(executor.execute(step, {})).rejects.toThrow('does not expose action');
    });

    it('should retry on failure', async () => {
      axios.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200, data: { result: 'success' } });

      const step = {
        id: 'test-step',
        plugin: 'test.plugin',
        action: 'fetch',
        retry: { maxAttempts: 2 }
      };

      const result = await executor.execute(step, {});
      expect(result).toEqual({ result: 'success' });
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      axios.post.mockRejectedValue(new Error('Network error'));

      const step = {
        id: 'test-step',
        plugin: 'test.plugin',
        action: 'fetch',
        retry: { maxAttempts: 2 }
      };

      await expect(executor.execute(step, {})).rejects.toThrow('Network error');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });
});

// Nicolas Larenas, nlarchive
