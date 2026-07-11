import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DiagnosticsController } from './diagnostics.controller';

@Module({
  controllers: [HealthController, DiagnosticsController],
})
export class HealthModule {}
