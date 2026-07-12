import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });
  // G28 TODO-04: drain Nest providers on SIGTERM/SIGINT
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // G28 TODO-11: reject unknown body fields
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // express.static can short-circuit before Nest CORS headers are applied.
  // Demo Play from file:// or another origin needs ACAO on /demo-output and /samples.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    res.header(
      'Access-Control-Allow-Headers',
      req.header('Access-Control-Request-Headers') ||
        'Content-Type, Accept, Range',
    );
    res.header(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range, Accept-Ranges',
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Serve dashboard + piano + voice UI same-origin
  app.useStaticAssets(join(process.cwd(), 'ui'), { prefix: '/ui' });
  // Sample texts for in-UI demo Play buttons
  app.useStaticAssets(join(process.cwd(), 'samples'), { prefix: '/samples' });
  app.useStaticAssets(join(process.cwd(), 'bench'), { prefix: '/bench' });
  // Cached WAV outputs from npm run demo:* (instant Play when present)
  app.useStaticAssets(join(process.cwd(), 'reports'), {
    prefix: '/reports',
  });
  app.useStaticAssets(join(process.cwd(), 'demo-output'), {
    prefix: '/demo-output',
  });

  const config = new DocumentBuilder()
    .setTitle('Resonara')
    .setDescription(
      'Shape sound. Speak the long form. Play freely. — Audio lab, sample piano, long-form system TTS.',
    )
    .setVersion('2.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // G28 TODO-34: desktop/lite default to loopback unless PORT/HOST overrides
  const port = Number(process.env.PORT || 3000);
  const host =
    process.env.HOST ||
    (process.env.RESONARA_LITE === '1' || process.env.RESONARA_DESKTOP === '1'
      ? '127.0.0.1'
      : '0.0.0.0');
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(
    `Resonara ${host}:${port} — Swagger /docs — Lab /ui/ — Piano /ui/piano/ — Voice /ui/voice/ — TTS dashboard /ui/deliverable/`,
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Resonara failed to start:', err);
  process.exit(1);
});
