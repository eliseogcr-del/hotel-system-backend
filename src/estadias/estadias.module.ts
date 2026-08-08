import { Module } from '@nestjs/common';
import { EstadiasController } from './estadias.controller';
import { EstadiasService } from './estadias.service';
import { ReservasModule } from '../reservas/reservas.module';

@Module({
  imports: [ReservasModule],
  controllers: [EstadiasController],
  providers: [EstadiasService],
})
export class EstadiasModule {}
