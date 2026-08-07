import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { HabitacionesService } from './habitaciones.service';
import { ValidarDisponibilidadDto } from './dto/validar-disponibilidad.dto';

@Controller('hoteles/:hotelId/habitaciones')
@UseGuards(AuthGuard, RolesGuard)
export class HabitacionesController {
  constructor(
    private readonly habitacionesService: HabitacionesService,
    private readonly supabase: SupabaseService,
  ) {}

  // Dashboard del semáforo: cualquier rol asignado al hotel puede verlo.
  @Get()
  @Roles('admin', 'recepcion', 'hk')
  async listar(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.habitacionesService.listarConEstado(client, hotelId);
  }

  // Motor de disponibilidad: lo usan recepción (al vender) y admin.
  @Post('disponibilidad')
  @Roles('admin', 'recepcion')
  async validarDisponibilidad(
    @Param('hotelId') hotelId: string,
    @Body() dto: ValidarDisponibilidadDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.habitacionesService.validarDisponibilidad(
      client,
      hotelId,
      dto,
    );
  }
}
