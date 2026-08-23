import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './common/supabase/supabase.module';
import { HabitacionesModule } from './habitaciones/habitaciones.module';
import { ReservasModule } from './reservas/reservas.module';
import { EstadiasModule } from './estadias/estadias.module';
import { CajaModule } from './caja/caja.module';
import { PersonalModule } from './personal/personal.module';
import { TareasHkModule } from './tareas-hk/tareas-hk.module';
import { CotizacionesModule } from './cotizaciones/cotizaciones.module';
import { ImportacionesCanalModule } from './importaciones-canal/importaciones-canal.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { HuespedesModule } from './huespedes/huespedes.module';
import { ProductosBazarModule } from './productos-bazar/productos-bazar.module';
import { TiposDesayunoModule } from './tipos-desayuno/tipos-desayuno.module';
import { TurnosModule } from './turnos/turnos.module';
import { TipoCambioModule } from './tipo-cambio/tipo-cambio.module';
import { ReportesModule } from './reportes/reportes.module';
import { BookingInboxModule } from './booking-inbox/booking-inbox.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    HabitacionesModule,
    ReservasModule,
    EstadiasModule,
    CajaModule,
    PersonalModule,
    TareasHkModule,
    CotizacionesModule,
    ImportacionesCanalModule,
    ConfiguracionModule,
    HuespedesModule,
    ProductosBazarModule,
    TiposDesayunoModule,
    TurnosModule,
    TipoCambioModule,
    ReportesModule,
    BookingInboxModule,
  ],
})
export class AppModule {}
