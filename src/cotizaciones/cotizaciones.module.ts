import { Module } from '@nestjs/common';
import { CotizacionesController } from './cotizaciones.controller';
import { CotizacionesService } from './cotizaciones.service';
import { HabitacionesModule } from '../habitaciones/habitaciones.module';
import { ReservasModule } from '../reservas/reservas.module';

@Module({
  imports: [HabitacionesModule, ReservasModule],
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
})
export class CotizacionesModule {}
