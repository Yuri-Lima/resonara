import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import configuration from './config/configuration';
import { Track } from './entities/track.entity';
import { TranscodeJob } from './entities/transcode-job.entity';
import { SamplePack } from './entities/sample-pack.entity';
import { PianoTake } from './entities/piano-take.entity';
import { FfmpegModule } from './ffmpeg/ffmpeg.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { PianoModule } from './piano/piano.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { TracksModule } from './tracks/tracks.module';
import { TtsModule } from './tts/tts.module';

const isLite =
  process.env.RESONARA_LITE === '1' || process.env.RESONARA_DESKTOP === '1';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        if (isLite) {
          const dataDir =
            config.get<string>('resonara.dataDir') ||
            path.join(process.cwd(), '.resonara-data');
          fs.mkdirSync(dataDir, { recursive: true });
          // sql.js — pure JS, no native compile (desktop-friendly)
          return {
            type: 'sqljs',
            location: path.join(dataDir, 'resonara.db'),
            autoSave: true,
            entities: [Track, TranscodeJob, SamplePack, PianoTake],
            synchronize: true,
            logging: false,
          };
        }
        return {
          type: 'postgres',
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
          entities: [Track, TranscodeJob, SamplePack, PianoTake],
          synchronize: true,
          logging: false,
        };
      },
    }),
    StorageModule,
    FfmpegModule,
    GatewayModule,
    QueueModule,
    TracksModule,
    JobsModule,
    PianoModule,
    HealthModule,
    TtsModule,
  ],
})
export class AppModule {}
