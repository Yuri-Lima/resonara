import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: Minio.Client;
  private buckets!: { originals: string; derivatives: string; artifacts: string };

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const m = this.config.get('minio');
    this.buckets = m.buckets;
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

  /** Stream upload — never buffer entire file. */
  async putStream(
    bucket: string,
    key: string,
    stream: Readable,
    size: number,
    meta?: Record<string, string>,
  ): Promise<void> {
    await this.client.putObject(bucket, key, stream, size, meta);
  }

  async putFile(
    bucket: string,
    key: string,
    filePath: string,
    meta?: Record<string, string>,
  ): Promise<void> {
    await this.client.fPutObject(bucket, key, filePath, meta);
  }

  async getStream(
    bucket: string,
    key: string,
    range?: { start: number; end: number },
  ): Promise<Readable> {
    if (range) {
      return this.client.getPartialObject(bucket, key, range.start, range.end - range.start + 1);
    }
    return this.client.getObject(bucket, key);
  }

  async getFile(bucket: string, key: string, destPath: string): Promise<void> {
    await this.client.fGetObject(bucket, key, destPath);
  }

  async stat(bucket: string, key: string) {
    return this.client.statObject(bucket, key);
  }

  async remove(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }

  async presignedGet(bucket: string, key: string, expirySec?: number): Promise<string> {
    const ttl = expirySec ?? this.config.get<number>('presignTtlSec') ?? 3600;
    return this.client.presignedGetObject(bucket, key, ttl);
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
    await this.client.putObject(bucket, key, buf, buf.length, {
      'Content-Type': 'application/json',
    });
  }
}
