import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok status in lite mode with mocked db', async () => {
    process.env.RESONARA_LITE = '1';
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue(1) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'resonara.lite') return true;
              if (k === 'ffmpeg.path') return 'ffmpeg';
              return undefined;
            },
          },
        },
      ],
    }).compile();
    const ctrl = moduleRef.get(HealthController);
    const res = await ctrl.check();
    expect(res.product).toBe('Resonara');
    expect(res.checks.database).toBe('ok');
    expect(res.piper).toBeDefined();
  });
});
