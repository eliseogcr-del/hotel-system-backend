import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { AlternarMantenimientoDto } from './dto/alternar-mantenimiento.dto';

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

  @Patch(':id/mantenimiento')
  @Roles('admin', 'recepcion')
  async alternarMantenimiento(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: AlternarMantenimientoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.habitacionesService.alternarMantenimientoConHuesped(
      client,
      hotelId,
      id,
      dto.activar,
      user.personalId,
    );
  }

  @Patch(':id/marcar-disponible')
  @Roles('admin', 'recepcion')
  async marcarDisponible(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.habitacionesService.marcarDisponible(client, hotelId, id);
  }
}
