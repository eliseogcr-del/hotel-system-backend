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
import { EstadiasService } from './estadias.service';
import { CheckinDto } from './dto/checkin.dto';
import { CheckinRapidoDto } from './dto/checkin-rapido.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { RegistrarMovimientoDto } from './dto/registrar-movimiento.dto';
import { ListarEstadiasQueryDto } from './dto/listar-estadias-query.dto';
import { ActualizarNotasDto } from './dto/actualizar-notas.dto';

@Controller('hoteles/:hotelId/estadias')
@UseGuards(AuthGuard, RolesGuard)
export class EstadiasController {
  constructor(
    private readonly estadiasService: EstadiasService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post('checkin')
  @Roles('admin', 'recepcion')
  async checkin(
    @Param('hotelId') hotelId: string,
    @Body() dto: CheckinDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.checkin(client, hotelId, dto, user.personalId);
  }

  @Post('checkin-rapido')
  @Roles('admin', 'recepcion')
  async checkinRapido(
    @Param('hotelId') hotelId: string,
    @Body() dto: CheckinRapidoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.checkinRapido(client, hotelId, dto, user.personalId);
  }

  @Post(':id/checkout')
  @Roles('admin', 'recepcion')
  async checkout(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: CheckoutDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.checkout(client, hotelId, id, user.personalId, dto);
  }

  @Post(':id/movimientos')
  @Roles('admin', 'recepcion')
  async registrarMovimiento(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: RegistrarMovimientoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.registrarMovimiento(
      client,
      hotelId,
      id,
      dto,
      user.personalId,
    );
  }

  @Get()
  @Roles('admin', 'recepcion')
  async listar(
    @Param('hotelId') hotelId: string,
    @Query() filtros: ListarEstadiasQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.listar(client, hotelId, filtros);
  }

  @Get(':id')
  @Roles('admin', 'recepcion')
  async detalle(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.obtenerDetalle(client, hotelId, id);
  }

  @Patch(':id/notas')
  @Roles('admin', 'recepcion')
  async actualizarNotas(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarNotasDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.actualizarNotas(client, hotelId, id, dto);
  }
}
