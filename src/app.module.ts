import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './common/supabase/supabase.module';
import { HabitacionesModule } from './habitaciones/habitaciones.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    HabitacionesModule,
    // Próximos módulos a agregar en la siguiente iteración:
    // ReservasModule, EstadiasModule, CajaModule, PersonalModule,
    // CotizacionesModule, TareasHkModule, ImportacionesCanalModule
  ],
})
export class AppModule {}
