import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { spawnSync } from 'child_process';
import Redis from 'ioredis';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'error';
    }

    try {
      const redis = new Redis({
        host: this.config.get('redis.host'),
        port: this.config.get('redis.port'),
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await redis.connect();
      const pong = await redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'error';
      redis.disconnect();
    } catch {
      checks.redis = 'error';
    }

    const ffPath = this.config.get('ffmpeg.path') || 'ffmpeg';
    const r = spawnSync(ffPath, ['-version'], { encoding: 'utf8' });
    checks.ffmpeg = r.status === 0 ? 'ok' : 'error';

    const healthy = Object.values(checks).every((v) => v === 'ok');
    return { status: healthy ? 'ok' : 'degraded', checks };
  }
}
