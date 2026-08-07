import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './common/supabase/supabase.module';
import { HabitacionesModule } from './habitaciones/habitaciones.module';
import { ReservasModule } from './reservas/reservas.module';
import { EstadiasModule } from './estadias/estadias.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    HabitacionesModule,
    ReservasModule,
    EstadiasModule,
    // Próximos módulos a agregar en la siguiente iteración:
    // CajaModule, PersonalModule, CotizacionesModule,
    // TareasHkModule, ImportacionesCanalModule
  ],
})
export class AppModule {}
