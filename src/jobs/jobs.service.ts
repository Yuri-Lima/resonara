import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TranscodeJob } from '../entities/transcode-job.entity';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(TranscodeJob)
    private readonly jobs: Repository<TranscodeJob>,
  ) {}

  async findOne(id: string): Promise<TranscodeJob> {
    const j = await this.jobs.findOne({ where: { id } });
    if (!j) throw new NotFoundException(`Job ${id} not found`);
    return j;
  }
}
