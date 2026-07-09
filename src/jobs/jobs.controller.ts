import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get job status and result' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.findOne(id);
  }
}
