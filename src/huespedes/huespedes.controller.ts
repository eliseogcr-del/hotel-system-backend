import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { HuespedesService } from './huespedes.service';
import { CrearHuespedDto } from './dto/crear-huesped.dto';
import { ActualizarHuespedDto } from './dto/actualizar-huesped.dto';
import { ListarHuespedesQueryDto } from './dto/listar-huespedes-query.dto';

@Controller('hoteles/:hotelId/huespedes')
@UseGuards(AuthGuard, RolesGuard)
export class HuespedesController {
  constructor(
    private readonly huespedesService: HuespedesService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin', 'recepcion')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearHuespedDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.huespedesService.crear(client, hotelId, dto);
  }

  @Get()
  @Roles('admin', 'recepcion')
  async listar(
    @Param('hotelId') hotelId: string,
    @Query() query: ListarHuespedesQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.huespedesService.listar(client, hotelId, query);
  }

  @Get(':id')
  @Roles('admin', 'recepcion')
  async obtenerDetalle(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.huespedesService.obtenerDetalle(client, hotelId, id);
  }

  @Patch(':id')
  @Roles('admin', 'recepcion')
  async actualizar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarHuespedDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.huespedesService.actualizar(client, hotelId, id, dto);
  }
}
