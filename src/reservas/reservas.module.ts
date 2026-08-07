import { Module } from '@nestjs/common';
import { ReservasController } from './reservas.controller';
import { ReservasService } from './reservas.service';
import { HabitacionesModule } from '../habitaciones/habitaciones.module';

@Module({
  imports: [HabitacionesModule],
  controllers: [ReservasController],
  providers: [ReservasService],
})
export class ReservasModule {}
