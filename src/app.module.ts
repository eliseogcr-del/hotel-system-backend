import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './common/supabase/supabase.module';
import { HabitacionesModule } from './habitaciones/habitaciones.module';
import { ReservasModule } from './reservas/reservas.module';
import { EstadiasModule } from './estadias/estadias.module';
import { CajaModule } from './caja/caja.module';
import { PersonalModule } from './personal/personal.module';
import { TareasHkModule } from './tareas-hk/tareas-hk.module';

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
    // Próximos módulos a agregar en la siguiente iteración:
    // CotizacionesModule, ImportacionesCanalModule
  ],
})
export class AppModule {}
