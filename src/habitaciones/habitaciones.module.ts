import { Module } from '@nestjs/common';
import { HabitacionesController } from './habitaciones.controller';
import { HabitacionesService } from './habitaciones.service';
import { DisponibilidadService } from './disponibilidad/disponibilidad.service';

@Module({
  controllers: [HabitacionesController],
  providers: [HabitacionesService, DisponibilidadService],
  exports: [DisponibilidadService],
})
export class HabitacionesModule {}
