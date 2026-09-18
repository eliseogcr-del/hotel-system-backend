import { Module } from '@nestjs/common';
import { HuespedesController } from './huespedes.controller';
import { HuespedesService } from './huespedes.service';

@Module({
  controllers: [HuespedesController],
  providers: [HuespedesService],
  exports: [HuespedesService],
})
export class HuespedesModule {}
