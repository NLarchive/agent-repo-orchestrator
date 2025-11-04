// orchestrator/plugins/minio-wrapper.js
// MinIO S3-compatible storage plugin wrapper for orchestrator

const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  ListObjectsV2Command,
  DeleteObjectCommand 
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class MinIOWrapper {
  constructor(config = {}) {
    // Security: No default credentials - must be explicitly provided
    const accessKey = config.accessKey || process.env.MINIO_ACCESS_KEY;
    const secretKey = config.secretKey || process.env.MINIO_SECRET_KEY;
    
    if (!accessKey || !secretKey) {
      throw new Error('MinIO credentials required: Set MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables');
    }
    
    this.config = {
      host: config.host || process.env.MINIO_HOST || 'localhost',
      port: config.port || process.env.MINIO_PORT || 9000,
      accessKey,
      secretKey,
      useSSL: config.useSSL !== undefined ? config.useSSL : false,
      bucket: config.bucket || process.env.MINIO_BUCKET || 'orchestrator',
      ...config
    };
    this.client = null;
  }

  async connect() {
    try {
      this.client = new S3Client({
        region: 'us-east-1',
        endpoint: `http${this.config.useSSL ? 's' : ''}://${this.config.host}:${this.config.port}`,
        credentials: {
          accessKeyId: this.config.accessKey,
          secretAccessKey: this.config.secretKey
        },
        forcePathStyle: true
      });
      console.log(`[MINIO] Connected to ${this.config.host}:${this.config.port}`);
      
      // Ensure bucket exists
      try {
        await this.client.send(new (require('@aws-sdk/client-s3').HeadBucketCommand)({
          Bucket: this.config.bucket
        }));
        console.log(`[MINIO] Bucket '${this.config.bucket}' already exists`);
      } catch (err) {
        if (err.name === 'NoSuchBucket' || err.$metadata?.httpStatusCode === 404) {
          console.log(`[MINIO] Creating bucket '${this.config.bucket}'...`);
          await this.client.send(new (require('@aws-sdk/client-s3').CreateBucketCommand)({
            Bucket: this.config.bucket
          }));
          console.log(`[MINIO] Bucket '${this.config.bucket}' created`);
        } else {
          throw err;
        }
      }
      
      return true;
    } catch (err) {
      console.error('[MINIO] Connection failed:', err.message);
      throw err;
    }
  }

  disconnect() {
    if (this.client) {
      this.client.destroy();
      console.log('[MINIO] Disconnected');
    }
  }

  async putObject(input) {
    const { key, data, metadata = {} } = input;
    if (!this.client) throw new Error('MinIO not connected');
    if (!key) throw new Error('Object key is required for putObject');
    if (data === undefined) throw new Error('Object data is required for putObject');
    
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: typeof data === 'string' ? Buffer.from(data) : 
               typeof data === 'object' ? JSON.stringify(data) : data,
        Metadata: metadata
      });
      
      const result = await this.client.send(command);
      console.log(`[MINIO] Uploaded ${key}:`, result.ETag);
      return { success: true, key, etag: result.ETag };
    } catch (err) {
      console.error(`[MINIO] Upload failed for ${key}:`, err.message);
      throw err;
    }
  }

  async getObject(key) {
    if (!this.client) throw new Error('MinIO not connected');
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      const result = await this.client.send(command);
      const data = await result.Body.transformToString();
      console.log(`[MINIO] Downloaded ${key}:`, data.length, 'bytes');
      return data;
    } catch (err) {
      console.error(`[MINIO] Download failed for ${key}:`, err.message);
      throw err;
    }
  }

  async listObjects(prefix = '', maxKeys = 100) {
    if (!this.client) throw new Error('MinIO not connected');
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys
      });
      
      const result = await this.client.send(command);
      const keys = (result.Contents || []).map(obj => obj.Key);
      console.log(`[MINIO] Listed ${keys.length} objects with prefix '${prefix}'`);
      return keys;
    } catch (err) {
      console.error(`[MINIO] List failed:`, err.message);
      throw err;
    }
  }

  async deleteObject(key) {
    if (!this.client) throw new Error('MinIO not connected');
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      const result = await this.client.send(command);
      console.log(`[MINIO] Deleted ${key}`);
      return { success: true, key };
    } catch (err) {
      console.error(`[MINIO] Delete failed for ${key}:`, err.message);
      throw err;
    }
  }

  async getPresignedUrl(key, expiresIn = 3600) {
    if (!this.client) throw new Error('MinIO not connected');
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      
      const url = await getSignedUrl(this.client, command, { expiresIn });
      console.log(`[MINIO] Generated presigned URL for ${key}`);
      return url;
    } catch (err) {
      console.error(`[MINIO] Presigned URL failed for ${key}:`, err.message);
      throw err;
    }
  }

  async getHealth() {
    try {
      const url = `http${this.config.useSSL ? 's' : ''}://${this.config.host}:${this.config.port}/minio/health/live`;
      const response = await fetch(url);
      return { status: 'healthy', connected: response.ok };
    } catch (err) {
      return { status: 'unhealthy', error: err.message, connected: false };
    }
  }
}

module.exports = MinIOWrapper;

// Nicolas Larenas, nlarchive
