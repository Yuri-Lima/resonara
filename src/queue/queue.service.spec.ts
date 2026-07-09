import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { JobType } from '../entities/transcode-job.entity';
import { JobRunnerService } from '../jobs/job-runner.service';
import { LITE_MODE, QueueService } from './queue.service';

describe('QueueService lite', () => {
  let service: QueueService;
  const runner = { run: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: JobRunnerService, useValue: runner },
        { provide: ModuleRef, useValue: { get: jest.fn() } },
        { provide: LITE_MODE, useValue: true },
      ],
    }).compile();
    service = moduleRef.get(QueueService);
    service.onModuleInit();
  });

  it('enqueue returns job id in lite mode', async () => {
    const id = await service.enqueue(JobType.TRANSCODE, {
      jobId: 'j1',
      trackId: 't1',
      params: {},
    });
    expect(id).toBe('j1');
  });
});
