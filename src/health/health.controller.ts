import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { ttsEngineAvailable } from '../tts/platform-tts';
import { isPiperAvailable } from '../tts/piper-tts';
import { probeFfmpegAvailability } from '../ffmpeg/resolve-ffmpeg';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    const lite =
      this.config.get<boolean>('resonara.lite') === true ||
      process.env.RESONARA_LITE === '1' ||
      process.env.RESONARA_DESKTOP === '1';

    const checks: Record<string, string> = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'ok';
      if (!lite) checks.postgres = 'ok';
    } catch {
      checks.database = 'error';
      if (!lite) checks.postgres = 'error';
    }

    if (!lite) {
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
    } else {
      checks.queue = 'inline';
      checks.storage = 'filesystem';
    }

    const preferredFf = this.config.get<string>('ffmpeg.path') || undefined;
    const preferredProbe =
      this.config.get<string>('ffmpeg.ffprobePath') || undefined;
    const ff = probeFfmpegAvailability(preferredFf, preferredProbe);
    checks.ffmpeg = ff.available ? 'ok' : 'error';

    const tts = ttsEngineAvailable();
    const piper = isPiperAvailable();
    checks.tts = tts.available || piper.available ? 'ok' : 'error';
    checks.piper = piper.available ? 'ok' : 'error';

    const required = lite
      ? ['database', 'ffmpeg']
      : ['postgres', 'redis', 'ffmpeg'];
    const healthy = required.every((k) => checks[k] === 'ok');

    return {
      status: healthy ? 'ok' : 'degraded',
      product: 'Resonara',
      mode: lite ? 'lite' : 'full',
      tagline: 'Offline long-form text-to-speech',
      checks,
      tts: tts,
      piper: {
        available: piper.available,
        binary: piper.binary || null,
        modelsDir: piper.modelsDir || null,
        voiceCount: piper.voiceCount,
        detail: piper.detail || null,
      },
      ffmpeg: {
        available: ff.available,
        path: ff.ffmpeg,
        ffprobe: ff.ffprobe,
        version: ff.versionLine || null,
        error: ff.error || null,
      },
    };
  }
}
