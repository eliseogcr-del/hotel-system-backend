import { Module } from '@nestjs/common';
import { CotizacionesController } from './cotizaciones.controller';
import { CotizacionesService } from './cotizaciones.service';
import { CotizacionPublicaController } from './cotizacion-publica.controller';
import { CotizacionPublicaService } from './cotizacion-publica.service';
import { HabitacionesModule } from '../habitaciones/habitaciones.module';
import { ReservasModule } from '../reservas/reservas.module';
import { HuespedesModule } from '../huespedes/huespedes.module';

@Module({
  imports: [HabitacionesModule, ReservasModule, HuespedesModule],
  controllers: [CotizacionesController, CotizacionPublicaController],
  providers: [CotizacionesService, CotizacionPublicaService],
})
export class CotizacionesModule {}
