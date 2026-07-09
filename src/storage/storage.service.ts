import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Object storage: MinIO in full mode, local filesystem in Resonara lite/desktop mode.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client | null = null;
  private lite = false;
  private root = '';
  private buckets!: {
    originals: string;
    derivatives: string;
    artifacts: string;
    samples: string;
  };

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const m = this.config.get('minio');
    this.buckets = m.buckets;
    this.lite =
      this.config.get<boolean>('resonara.lite') === true ||
      process.env.RESONARA_LITE === '1' ||
      process.env.RESONARA_DESKTOP === '1';

    if (this.lite) {
      this.root =
        this.config.get<string>('resonara.dataDir') ||
        path.join(process.cwd(), '.resonara-data');
      for (const b of Object.values(this.buckets)) {
        await fsp.mkdir(path.join(this.root, b), { recursive: true });
      }
      this.logger.log(`Storage lite mode root=${this.root}`);
      return;
    }

    this.client = new Minio.Client({
      endPoint: m.endPoint,
      port: m.port,
      useSSL: m.useSSL,
      accessKey: m.accessKey,
      secretKey: m.secretKey,
    });
    for (const b of Object.values(this.buckets)) {
      const exists = await this.client.bucketExists(b).catch(() => false);
      if (!exists) {
        await this.client.makeBucket(b, '').catch((e) => {
          this.logger.warn(`Bucket create ${b}: ${e.message}`);
        });
      }
    }
  }

  get originalBucket() {
    return this.buckets.originals;
  }
  get derivativeBucket() {
    return this.buckets.derivatives;
  }
  get artifactBucket() {
    return this.buckets.artifacts;
  }
  get samplesBucket() {
    return this.buckets.samples;
  }

  private keyPath(bucket: string, key: string): string {
    return path.join(this.root, bucket, key);
  }

  async putStream(
    bucket: string,
    key: string,
    stream: Readable,
    size: number,
    meta?: Record<string, string>,
  ): Promise<void> {
    if (this.lite) {
      const dest = this.keyPath(bucket, key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await pipeline(stream, fs.createWriteStream(dest));
      return;
    }
    await this.client!.putObject(bucket, key, stream, size, meta);
  }

  async putFile(
    bucket: string,
    key: string,
    filePath: string,
    meta?: Record<string, string>,
  ): Promise<void> {
    if (this.lite) {
      const dest = this.keyPath(bucket, key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(filePath, dest);
      return;
    }
    await this.client!.fPutObject(bucket, key, filePath, meta);
  }

  async getStream(
    bucket: string,
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    if (this.lite) {
      const dest = this.keyPath(bucket, key);
      if (range) {
        return fs.createReadStream(dest, {
          start: range.start,
          end: range.end,
        });
      }
      return fs.createReadStream(dest);
    }
    if (range) {
      return this.client!.getPartialObject(
        bucket,
        key,
        range.start,
        range.end - range.start + 1,
      );
    }
    return this.client!.getObject(bucket, key);
  }

  async getFile(bucket: string, key: string, destPath: string): Promise<void> {
    if (this.lite) {
      const src = this.keyPath(bucket, key);
      await fsp.mkdir(path.dirname(destPath), { recursive: true });
      await fsp.copyFile(src, destPath);
      return;
    }
    await this.client!.fGetObject(bucket, key, destPath);
  }

  async stat(bucket: string, key: string) {
    if (this.lite) {
      const st = await fsp.stat(this.keyPath(bucket, key));
      return { size: st.size, lastModified: st.mtime, etag: '', metaData: {} };
    }
    return this.client!.statObject(bucket, key);
  }

  async remove(bucket: string, key: string): Promise<void> {
    if (this.lite) {
      await fsp.unlink(this.keyPath(bucket, key)).catch(() => undefined);
      return;
    }
    await this.client!.removeObject(bucket, key);
  }

  async presignedGet(
    bucket: string,
    key: string,
    _expirySec?: number,
  ): Promise<string> {
    if (this.lite) {
      // Local HTTP path served by Nest static/stream endpoints — use API download
      const port = this.config.get<number>('port') || 3000;
      const publicUrl =
        this.config.get<string>('apiPublicUrl') || `http://127.0.0.1:${port}`;
      return `${publicUrl}/storage/${encodeURIComponent(bucket)}/${key
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`;
    }
    const ttl = _expirySec ?? this.config.get<number>('presignTtlSec') ?? 3600;
    return this.client!.presignedGetObject(bucket, key, ttl);
  }

  async getJson<T>(bucket: string, key: string): Promise<T | null> {
    try {
      const stream = await this.getStream(bucket, key);
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(Buffer.from(c));
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  async putJson(bucket: string, key: string, data: unknown): Promise<void> {
    const buf = Buffer.from(JSON.stringify(data), 'utf8');
    if (this.lite) {
      const dest = this.keyPath(bucket, key);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, buf);
      return;
    }
    await this.client!.putObject(bucket, key, buf, buf.length, {
      'Content-Type': 'application/json',
    });
  }

  /** Absolute path for lite mode (desktop local files). */
  resolveLocalPath(bucket: string, key: string): string | null {
    if (!this.lite) return null;
    return this.keyPath(bucket, key);
  }

  isLite(): boolean {
    return this.lite;
  }
}
