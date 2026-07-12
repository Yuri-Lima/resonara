/**
 * Optional worker process for full-stack deployments.
 * TTS jobs run in-process in lite/desktop mode; this entry keeps a Nest
 * application context alive for future background workers.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const logger = new Logger('Worker');
  logger.log(
    `Resonara worker context started (FFMPEG_CONCURRENCY=${process.env.FFMPEG_CONCURRENCY || 'cpus'})`,
  );
  process.on('SIGINT', async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap();
