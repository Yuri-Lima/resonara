import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        entities: [Track, TranscodeJob, SamplePack, PianoTake],
        synchronize: true,
        logging: false,
      }),
    }),
    StorageModule,
    FfmpegModule,
    GatewayModule,
    QueueModule,
    TracksModule,
    JobsModule,
    PianoModule,
    HealthModule,
  ],
})
export class AppModule {}
