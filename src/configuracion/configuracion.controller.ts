import {
  Body,
  Controller,
  Delete,
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
import { ConfiguracionService } from './configuracion.service';
import { CrearTipoHabitacionDto } from './dto/crear-tipo-habitacion.dto';
import { ActualizarTipoHabitacionDto } from './dto/actualizar-tipo-habitacion.dto';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';
import { ActualizarHabitacionDto } from './dto/actualizar-habitacion.dto';
import { CrearCocheraDto } from './dto/crear-cochera.dto';
import { ActualizarCocheraDto } from './dto/actualizar-cochera.dto';
import { ActualizarHotelDto } from './dto/actualizar-hotel.dto';

@Controller('hoteles/:hotelId')
@UseGuards(AuthGuard, RolesGuard)
export class ConfiguracionController {
  constructor(
    private readonly configuracionService: ConfiguracionService,
    private readonly supabase: SupabaseService,
  ) {}

  // ---------- Hotel ----------

  @Get()
  @Roles('admin', 'recepcion', 'hk')
  async obtenerHotel(@Param('hotelId') hotelId: string, @CurrentUser() user: RequestUser) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.obtenerHotel(client, hotelId);
  }

  @Patch()
  @Roles('admin')
  async actualizarHotel(
    @Param('hotelId') hotelId: string,
    @Body() dto: ActualizarHotelDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.actualizarHotel(client, hotelId, dto);
  }

  // ---------- Tipos de habitación ----------

  @Post('tipos-habitacion')
  @Roles('admin')
  async crearTipoHabitacion(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearTipoHabitacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.crearTipoHabitacion(client, hotelId, dto);
  }

  @Get('tipos-habitacion')
  @Roles('admin', 'recepcion')
  async listarTiposHabitacion(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.listarTiposHabitacion(client, hotelId);
  }

  @Patch('tipos-habitacion/:id')
  @Roles('admin')
  async actualizarTipoHabitacion(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarTipoHabitacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.actualizarTipoHabitacion(client, hotelId, id, dto);
  }

  @Delete('tipos-habitacion/:id')
  @Roles('admin')
  async eliminarTipoHabitacion(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.eliminarTipoHabitacion(client, hotelId, id);
  }

  // ---------- Habitaciones ----------

  @Post('habitaciones')
  @Roles('admin')
  async crearHabitacion(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearHabitacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.crearHabitacion(client, hotelId, dto);
  }

  @Patch('habitaciones/:id')
  @Roles('admin')
  async actualizarHabitacion(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarHabitacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.actualizarHabitacion(client, hotelId, id, dto);
  }

  @Delete('habitaciones/:id')
  @Roles('admin')
  async eliminarHabitacion(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.eliminarHabitacion(client, hotelId, id);
  }

  // ---------- Cocheras ----------

  @Post('cocheras')
  @Roles('admin')
  async crearCochera(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearCocheraDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.crearCochera(client, hotelId, dto);
  }

  // Roles('admin', 'recepcion') porque este endpoint también lo usa el
  // dashboard de Habitaciones (todo rol) para mostrar el semáforo de
  // cocheras -- no solo la pantalla de Configuración (que sí es admin-only
  // para crear/editar cocheras, ver POST/PATCH abajo).
  @Get('cocheras')
  @Roles('admin', 'recepcion')
  async listarCocheras(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.listarCocheras(client, hotelId);
  }

  @Patch('cocheras/:id')
  @Roles('admin')
  async actualizarCochera(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarCocheraDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.configuracionService.actualizarCochera(client, hotelId, id, dto);
  }
}
