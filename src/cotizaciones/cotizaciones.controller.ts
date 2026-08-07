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
import { CotizacionesService } from './cotizaciones.service';
import { CrearCotizacionDto } from './dto/crear-cotizacion.dto';
import { ActualizarEstadoCotizacionDto } from './dto/actualizar-estado-cotizacion.dto';
import { ListarCotizacionesQueryDto } from './dto/listar-cotizaciones-query.dto';

@Controller('hoteles/:hotelId/cotizaciones')
@UseGuards(AuthGuard, RolesGuard)
export class CotizacionesController {
  constructor(
    private readonly cotizacionesService: CotizacionesService,
    private readonly supabase: SupabaseService,
  ) {}

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
