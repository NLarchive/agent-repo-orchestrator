const MinIOWrapper = require('../../plugins/minio-wrapper');
const presigner = require('@aws-sdk/s3-request-presigner');

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn()
}));

describe('MinIOWrapper', () => {
  it('should throw if credentials are missing', async () => {
    // Mock process.env to not have MinIO credentials
    const originalEnv = process.env;
    process.env = { ...originalEnv, MINIO_ACCESS_KEY: undefined, MINIO_SECRET_KEY: undefined };
    
    expect(() => new MinIOWrapper({})).toThrow('MinIO credentials required: Set MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables');
    
    // Restore original env
    process.env = originalEnv;
  });

  it('should throw when putObject called before connect', async () => {
    const w = new MinIOWrapper({ accessKey: 'a', secretKey: 'b' });
    await expect(w.putObject('k', 'data')).rejects.toThrow('MinIO not connected');
  });

  it('should throw when getObject called before connect', async () => {
    const w = new MinIOWrapper({ accessKey: 'a', secretKey: 'b' });
    await expect(w.getObject('k')).rejects.toThrow('MinIO not connected');
  });

  it('should propagate client errors on putObject', async () => {
    const w = new MinIOWrapper({ accessKey: 'a', secretKey: 'b' });
    w.client = { send: jest.fn().mockRejectedValue(new Error('send failed')) };

    await expect(w.putObject({ key: 'k', data: 'data' })).rejects.toThrow('send failed');
    expect(w.client.send).toHaveBeenCalled();
  });

  it('should return data from getObject when client returns Body with transformToString', async () => {
    const w = new MinIOWrapper({ accessKey: 'a', secretKey: 'b' });
    w.client = { send: jest.fn().mockResolvedValue({ Body: { transformToString: async () => 'payload' } }) };

    const data = await w.getObject('k');
    expect(data).toBe('payload');
    expect(w.client.send).toHaveBeenCalled();
  });

  it('should return keys list from listObjects', async () => {
    const w = new MinIOWrapper({ accessKey: 'a', secretKey: 'b' });
    w.client = { send: jest.fn().mockResolvedValue({ Contents: [{ Key: 'a' }, { Key: 'b' }] }) };

    const keys = await w.listObjects('pref');
    expect(keys).toEqual(['a', 'b']);
  });

  it('should generate presigned URL using getSignedUrl', async () => {
    presigner.getSignedUrl.mockResolvedValue('https://signed-url');

    const w = new MinIOWrapper({ accessKey: 'a', secretKey: 'b' });
    w.client = { /* client not used directly by presigner mock */ };

    const url = await w.getPresignedUrl('k', 60);
    expect(url).toBe('https://signed-url');
    expect(presigner.getSignedUrl).toHaveBeenCalled();
  });
});

// Nicolas Larenas, nlarchive
