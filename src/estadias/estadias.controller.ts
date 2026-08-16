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
import { ActualizarEstadiaDto } from './dto/actualizar-estadia.dto';
import { EditarMovimientoDto } from './dto/editar-movimiento.dto';

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

  @Post(':id/movimientos/:movimientoId/anular')
  @Roles('admin', 'recepcion')
  async anularMovimiento(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Param('movimientoId') movimientoId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.anularMovimiento(client, hotelId, id, movimientoId, user.personalId);
  }

  // Solo admin: corrige el monto de cualquier movimiento (cargo o pago),
  // sin la restricción de "solo cargos" ni el bloqueo por estadía
  // finalizada que tiene anularMovimiento() -- es la herramienta de
  // corrección de errores, no la operación normal del día a día.
  @Patch(':id/movimientos/:movimientoId')
  @Roles('admin')
  async editarMovimiento(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Param('movimientoId') movimientoId: string,
    @Body() dto: EditarMovimientoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.editarMovimiento(client, hotelId, id, movimientoId, dto, user.personalId);
  }

  // Sin cron real en el backend (Render free tier se duerme): esto lo
  // dispara el frontend cada vez que se carga/recarga Habitaciones, para
  // extender automáticamente las estadías cuya salida programada ya venció
  // hace más de 1 hora sin que nadie hiciera checkout ni la ampliara.
  @Post('procesar-salidas-vencidas')
  @Roles('admin', 'recepcion')
  async procesarSalidasVencidas(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.procesarSalidasVencidas(client, hotelId);
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

  @Patch(':id')
  @Roles('admin', 'recepcion')
  async actualizar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarEstadiaDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.estadiasService.actualizar(client, hotelId, id, dto, user.personalId);
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
