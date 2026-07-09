import * as os from 'os';

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'audio',
    password: process.env.DATABASE_PASSWORD || 'audio',
    name: process.env.DATABASE_NAME || 'audio_service',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    buckets: {
      originals: process.env.MINIO_BUCKET_ORIGINALS || 'audio-originals',
      derivatives: process.env.MINIO_BUCKET_DERIVATIVES || 'audio-derivatives',
      artifacts: process.env.MINIO_BUCKET_ARTIFACTS || 'audio-artifacts',
      samples: process.env.MINIO_BUCKET_SAMPLES || 'piano-samples',
    },
  },
  ffmpeg: {
    path: process.env.FFMPEG_PATH || '',
    ffprobePath: process.env.FFPROBE_PATH || '',
    concurrency: parseInt(
      process.env.FFMPEG_CONCURRENCY || String(os.cpus().length),
      10,
    ),
    timeoutMs: parseInt(process.env.FFMPEG_TIMEOUT_MS || '600000', 10),
  },
  upload: {
    maxMb: parseInt(process.env.MAX_UPLOAD_MB || '2048', 10),
  },
  presignTtlSec: parseInt(process.env.PRESIGN_TTL_SEC || '3600', 10),
  apiPublicUrl: process.env.API_PUBLIC_URL || '',
});
