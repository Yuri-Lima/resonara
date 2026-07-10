import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StorageService } from './storage.service';

describe('StorageService lite mode', () => {
  let service: StorageService;
  let root: string;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'resonara-store-'));
    process.env.RESONARA_LITE = '1';
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) => {
              if (k === 'minio') {
                return {
                  buckets: {
                    originals: 'audio-originals',
                    derivatives: 'audio-derivatives',
                    artifacts: 'audio-artifacts',
                    samples: 'piano-samples',
                  },
                };
              }
              if (k === 'resonara.lite') return true;
              if (k === 'resonara.dataDir') return root;
              return undefined;
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(StorageService);
    await service.onModuleInit();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('exposes bucket names', () => {
    expect(service.originalBucket).toBe('audio-originals');
    expect(service.artifactBucket).toBe('audio-artifacts');
  });

  it('put and get file bytes', async () => {
    const key = 'test/hello.txt';
    const local = path.join(root, 'src.txt');
    fs.writeFileSync(local, 'hello resonara');
    await service.putFile(service.originalBucket, key, local);
    const dest = path.join(root, 'out.txt');
    await service.getFile(service.originalBucket, key, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('hello resonara');
  });

  it('put and get json', async () => {
    await service.putJson(service.artifactBucket, 'meta.json', { a: 1 });
    const j = await service.getJson(service.artifactBucket, 'meta.json');
    expect(j).toEqual({ a: 1 });
  });
});
