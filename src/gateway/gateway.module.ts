import { Global, Module } from '@nestjs/common';
import { JobsGateway } from './jobs.gateway';

@Global()
@Module({
  providers: [JobsGateway],
  exports: [JobsGateway],
})
export class GatewayModule {}
