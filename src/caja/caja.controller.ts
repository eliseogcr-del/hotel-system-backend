import {
  Body,
  Controller,
  Get,
  Param,
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
import { CajaService } from './caja.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';

@Controller('hoteles/:hotelId/caja')
@UseGuards(AuthGuard, RolesGuard)
export class CajaController {
  constructor(
    private readonly cajaService: CajaService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get('turnos')
  @Roles('admin', 'recepcion')
  async listarTurnos(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cajaService.listarTurnos(client, hotelId);
  }

  @Post('abrir')
  @Roles('admin', 'recepcion')
  async abrir(
    @Param('hotelId') hotelId: string,
    @Body() dto: AbrirTurnoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cajaService.abrirTurno(client, hotelId, dto, user.personalId);
  }

  @Get('actual')
  @Roles('admin', 'recepcion')
  async actual(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cajaService.obtenerSesionActual(client, hotelId, user.personalId);
  }

  @Get('sesiones')
  @Roles('admin', 'recepcion')
  async listarSesiones(
    @Param('hotelId') hotelId: string,
    @Query('estado') estado: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cajaService.listarSesiones(client, hotelId, estado);
  }

  @Get('sesiones/:id')
  @Roles('admin', 'recepcion')
  async detalle(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cajaService.obtenerDetalle(client, hotelId, id);
  }

  @Post('sesiones/:id/movimientos')
  @Roles('admin', 'recepcion')
  async registrarMovimiento(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: RegistrarMovimientoCajaDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cajaService.registrarMovimiento(client, hotelId, id, dto, user.personalId);
  }

  @Post('sesiones/:id/cerrar')
  @Roles('admin', 'recepcion')
  async cerrar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cajaService.cerrarTurno(client, hotelId, id, user.personalId);
  }
}
