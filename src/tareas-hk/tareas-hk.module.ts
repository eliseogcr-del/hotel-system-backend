import { Module } from '@nestjs/common';
import { TareasHkController } from './tareas-hk.controller';
import { TareasHkService } from './tareas-hk.service';

@Module({
  controllers: [TareasHkController],
  providers: [TareasHkService],
})
export class TareasHkModule {}
