import {
  Body,
  Controller,
  Delete,
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
import { CotizacionesService } from './cotizaciones.service';
import { CrearCotizacionDto } from './dto/crear-cotizacion.dto';
import { CrearCotizacionDetalleDto } from './dto/crear-cotizacion-detalle.dto';
import { EditarCotizacionDetalleDto } from './dto/editar-cotizacion-detalle.dto';
import { EditarFechasCotizacionDto } from './dto/editar-fechas-cotizacion.dto';
import { DisponibilidadCotizacionDto } from './dto/disponibilidad-cotizacion.dto';
import { ActualizarEstadoCotizacionDto } from './dto/actualizar-estado-cotizacion.dto';
import { ListarCotizacionesQueryDto } from './dto/listar-cotizaciones-query.dto';

@Controller('hoteles/:hotelId/cotizaciones')
@UseGuards(AuthGuard, RolesGuard)
export class CotizacionesController {
  constructor(
    private readonly cotizacionesService: CotizacionesService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post('habitaciones-disponibles')
  @Roles('admin', 'recepcion')
  async habitacionesDisponibles(
    @Param('hotelId') hotelId: string,
    @Body() dto: DisponibilidadCotizacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.habitacionesDisponibles(client, hotelId, dto);
  }

  @Post('habitaciones-no-disponibles')
  @Roles('admin', 'recepcion')
  async habitacionesNoDisponibles(
    @Param('hotelId') hotelId: string,
    @Body() dto: DisponibilidadCotizacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.habitacionesNoDisponibles(client, hotelId, dto);
  }

  @Post()
  @Roles('admin', 'recepcion')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearCotizacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.crear(client, hotelId, dto, user.personalId);
  }

  @Get()
  @Roles('admin', 'recepcion')
  async listar(
    @Param('hotelId') hotelId: string,
    @Query() filtros: ListarCotizacionesQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.listar(client, hotelId, filtros);
  }

  @Get(':id')
  @Roles('admin', 'recepcion')
  async detalle(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.obtenerDetalle(client, hotelId, id);
  }

  @Patch(':id/estado')
  @Roles('admin', 'recepcion')
  async actualizarEstado(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarEstadoCotizacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.actualizarEstado(client, hotelId, id, dto);
  }

  @Patch(':id/fechas')
  @Roles('admin', 'recepcion')
  async editarFechas(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: EditarFechasCotizacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.editarFechas(client, hotelId, id, dto);
  }

  @Get(':id/habitaciones-disponibles')
  @Roles('admin', 'recepcion')
  async habitacionesDisponiblesParaCotizacion(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.habitacionesDisponiblesParaCotizacion(client, hotelId, id);
  }

  @Get(':id/habitaciones-no-disponibles')
  @Roles('admin', 'recepcion')
  async habitacionesNoDisponiblesParaCotizacion(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.habitacionesNoDisponiblesParaCotizacion(client, hotelId, id);
  }

  @Post(':id/detalle')
  @Roles('admin', 'recepcion')
  async agregarLinea(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: CrearCotizacionDetalleDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.agregarLinea(client, hotelId, id, dto);
  }

  @Patch(':id/detalle/:lineaId')
  @Roles('admin', 'recepcion')
  async editarLinea(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @Body() dto: EditarCotizacionDetalleDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.editarLinea(client, hotelId, id, lineaId, dto);
  }

  @Delete(':id/detalle/:lineaId')
  @Roles('admin', 'recepcion')
  async eliminarLinea(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Param('lineaId') lineaId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.eliminarLinea(client, hotelId, id, lineaId);
  }

  @Post(':id/convertir')
  @Roles('admin', 'recepcion')
  async convertir(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.cotizacionesService.convertir(client, hotelId, id, user.personalId);
  }
}
