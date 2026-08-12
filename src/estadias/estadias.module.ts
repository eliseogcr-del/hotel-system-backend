import { Module } from '@nestjs/common';
import { EstadiasController } from './estadias.controller';
import { EstadiasService } from './estadias.service';
import { ReservasModule } from '../reservas/reservas.module';
import { TipoCambioModule } from '../tipo-cambio/tipo-cambio.module';

@Module({
  imports: [ReservasModule, TipoCambioModule],
  controllers: [EstadiasController],
  providers: [EstadiasService],
})
export class EstadiasModule {}
