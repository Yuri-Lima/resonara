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

  // Serve dashboard + piano + voice UI same-origin
  app.useStaticAssets(join(process.cwd(), 'ui'), { prefix: '/ui' });

  const config = new DocumentBuilder()
    .setTitle('Resonara')
    .setDescription(
      'Shape sound. Speak the long form. Play freely. — Audio lab, sample piano, long-form system TTS.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `Resonara :${port} — Swagger /docs — Lab /ui/ — Piano /ui/piano/ — Voice /ui/voice/`,
  );
}

bootstrap();
