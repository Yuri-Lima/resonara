import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TranscodeJob, JobStatus, JobType } from '../entities/transcode-job.entity';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  const entity = {
    id: 'job-1',
    status: JobStatus.QUEUED,
    type: JobType.TRANSCODE,
  } as TranscodeJob;
  const repo = {
    findOne: jest.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'job-1' ? entity : null,
    ),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getRepositoryToken(TranscodeJob), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(JobsService);
  });

  it('findOne returns job', async () => {
    const j = await service.findOne('job-1');
    expect(j.id).toBe('job-1');
  });

  it('findOne throws when missing', async () => {
    await expect(service.findOne('missing')).rejects.toThrow(/not found/);
  });
});
