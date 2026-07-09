/**
 * Dedicated worker process — same Nest app context, no HTTP server required.
 * Concurrency for ffmpeg jobs is capped via FFMPEG_CONCURRENCY (default CPU count).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const logger = new Logger('Worker');
  logger.log(
    `Audio worker started (FFMPEG_CONCURRENCY=${process.env.FFMPEG_CONCURRENCY || 'cpus'})`,
  );
  // Processors register via BullMQ decorators; keep process alive.
  process.on('SIGINT', async () => {
    await app.close();
    process.exit(0);
  });
}

bootstrap();
