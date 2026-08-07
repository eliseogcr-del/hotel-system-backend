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
import { TareasHkService } from './tareas-hk.service';
import { CrearTareaHkDto } from './dto/crear-tarea-hk.dto';
import { AsignarTareaHkDto } from './dto/asignar-tarea-hk.dto';
import { ListarTareasHkQueryDto } from './dto/listar-tareas-hk-query.dto';

@Controller('hoteles/:hotelId/tareas-hk')
@UseGuards(AuthGuard, RolesGuard)
export class TareasHkController {
  constructor(
    private readonly tareasHkService: TareasHkService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin', 'recepcion', 'hk')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearTareaHkDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tareasHkService.crear(client, hotelId, dto, user.personalId);
  }

  @Get()
  @Roles('admin', 'recepcion', 'hk')
  async listar(
    @Param('hotelId') hotelId: string,
    @Query() filtros: ListarTareasHkQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tareasHkService.listar(client, hotelId, filtros);
  }

  @Get(':id')
  @Roles('admin', 'recepcion', 'hk')
  async detalle(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tareasHkService.obtenerDetalle(client, hotelId, id);
  }

  @Post(':id/iniciar')
  @Roles('admin', 'recepcion', 'hk')
  async iniciar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tareasHkService.iniciar(client, hotelId, id, user.personalId);
  }

  @Post(':id/terminar')
  @Roles('admin', 'recepcion', 'hk')
  async terminar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tareasHkService.terminar(client, hotelId, id);
  }

  @Patch(':id/asignar')
  @Roles('admin', 'recepcion', 'hk')
  async asignar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: AsignarTareaHkDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tareasHkService.asignar(client, hotelId, id, dto);
  }
}
