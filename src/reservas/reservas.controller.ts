import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ReservasService } from './reservas.service';
import { CrearReservaDto } from './dto/crear-reserva.dto';
import { CrearReservaHabitacionDto } from './dto/crear-reserva-habitacion.dto';
import { ListarReservasQueryDto } from './dto/listar-reservas-query.dto';

@Controller('hoteles/:hotelId/reservas')
@UseGuards(AuthGuard, RolesGuard)
export class ReservasController {
  constructor(
    private readonly reservasService: ReservasService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin', 'recepcion')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearReservaDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.crear(client, hotelId, dto, user.personalId);
  }

  @Get()
  @Roles('admin', 'recepcion')
  async listar(
    @Param('hotelId') hotelId: string,
    @Query() filtros: ListarReservasQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.listar(client, hotelId, filtros);
  }

  @Get(':id')
  @Roles('admin', 'recepcion')
  async detalle(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.obtenerDetalle(client, hotelId, id);
  }

  @Patch(':id/cancelar')
  @Roles('admin', 'recepcion')
  async cancelar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.cancelar(client, hotelId, id);
  }

  @Post(':id/habitaciones')
  @Roles('admin', 'recepcion')
  async agregarHabitacion(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: CrearReservaHabitacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.agregarHabitacion(client, hotelId, id, dto);
  }

  @Patch(':id/confirmar')
  @Roles('admin', 'recepcion')
  async confirmar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.confirmar(client, hotelId, id);
  }
}
