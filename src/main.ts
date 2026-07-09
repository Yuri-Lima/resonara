import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Serve dashboard + piano UI same-origin (presigned sample fetch + API)
  app.useStaticAssets(join(process.cwd(), 'ui'), { prefix: '/ui' });

  const config = new DocumentBuilder()
    .setTitle('Audio Processing Service')
    .setDescription(
      'Upload, transcode, two-pass EBU R128 normalize, waveform, silence, trim, stream, piano',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `Audio service :${port} — Swagger /docs — Piano /ui/piano/ — Dashboard /ui/`,
  );
}

bootstrap();
