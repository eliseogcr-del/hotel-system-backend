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
import { CalendarioQueryDto } from './dto/calendario-query.dto';
import { ActualizarReservaLineaDto } from './dto/actualizar-reserva-linea.dto';
import { CancelarReservaDto } from './dto/cancelar-reserva.dto';

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

  @Get('calendario')
  @Roles('admin', 'recepcion')
  async calendario(
    @Param('hotelId') hotelId: string,
    @Query() dto: CalendarioQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.obtenerCalendario(
      client,
      hotelId,
      dto.desde,
      dto.hasta,
    );
  }

  // Vista mínima para el panel de Habitaciones (HK incluido): quién llega en
  // los próximos 3 días, sin datos financieros ni de contacto -- ver
  // ReservasService.proximasLlegadas().
  @Get('proximas-llegadas')
  @Roles('admin', 'recepcion', 'hk')
  async proximasLlegadas(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.proximasLlegadas(client, hotelId);
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
    @Body() dto: CancelarReservaDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.cancelar(client, hotelId, id, dto, user.personalId);
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

  @Patch(':id/habitaciones/:lineaId')
  @Roles('admin', 'recepcion')
  async actualizarLinea(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: ActualizarReservaLineaDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reservasService.actualizarLinea(
      client,
      hotelId,
      id,
      lineaId,
      dto,
      user.personalId,
    );
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
