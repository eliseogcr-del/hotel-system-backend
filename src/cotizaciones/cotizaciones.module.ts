import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { CotizacionesController } from './cotizaciones.controller';
import { CotizacionesService } from './cotizaciones.service';
import { CotizacionPublicaController } from './cotizacion-publica.controller';
import { CotizacionPublicaService } from './cotizacion-publica.service';
import { IntegracionDisponibilidadController } from './integracion-disponibilidad.controller';
import { HabitacionesModule } from '../habitaciones/habitaciones.module';
import { ReservasModule } from '../reservas/reservas.module';
import { HuespedesModule } from '../huespedes/huespedes.module';

@Module({
  imports: [
    HabitacionesModule,
    ReservasModule,
    HuespedesModule,
    // Scoped a este módulo a propósito, no registrado como APP_GUARD
    // global -- el límite por IP solo se aplica donde explícitamente se
    // pone @UseGuards(ThrottlerGuard) (CotizacionPublicaController e
    // IntegracionDisponibilidadController), nunca al login ni a las rutas
    // autenticadas del personal.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
  ],
  controllers: [
    CotizacionesController,
    CotizacionPublicaController,
    IntegracionDisponibilidadController,
  ],
  providers: [CotizacionesService, CotizacionPublicaService],
})
export class CotizacionesModule {}
