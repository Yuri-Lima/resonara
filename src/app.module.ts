import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import configuration from './config/configuration';
import { TtsJob } from './entities/tts-job.entity';
import { TtsBatch } from './entities/tts-batch.entity';
import { PronunciationEntry } from './entities/pronunciation.entity';
import { Bookmark } from './entities/bookmark.entity';
import { FfmpegModule } from './ffmpeg/ffmpeg.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { TtsModule } from './tts/tts.module';
import { SttModule } from './stt/stt.module';

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
            entities: [TtsJob, TtsBatch, PronunciationEntry, Bookmark],
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
          entities: [TtsJob, TtsBatch, PronunciationEntry, Bookmark],
          synchronize: true,
          logging: false,
        };
      },
    }),
    StorageModule,
    FfmpegModule,
    GatewayModule,
    HealthModule,
    TtsModule,
    SttModule,
  ],
})
export class AppModule {}
