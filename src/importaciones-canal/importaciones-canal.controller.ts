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
import { ImportacionesCanalService } from './importaciones-canal.service';
import { ProcesarCorreoDto } from './dto/procesar-correo.dto';
import { ListarImportacionesQueryDto } from './dto/listar-importaciones-query.dto';

@Controller('hoteles/:hotelId/importaciones-canal')
@UseGuards(AuthGuard, RolesGuard)
export class ImportacionesCanalController {
  constructor(
    private readonly importacionesService: ImportacionesCanalService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin', 'recepcion')
  async procesarCorreo(
    @Param('hotelId') hotelId: string,
    @Body() dto: ProcesarCorreoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.importacionesService.procesarCorreo(client, hotelId, dto, user.personalId);
  }

  @Get()
  @Roles('admin', 'recepcion')
  async listar(
    @Param('hotelId') hotelId: string,
    @Query() filtros: ListarImportacionesQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.importacionesService.listar(client, hotelId, filtros);
  }

  @Get(':id')
  @Roles('admin', 'recepcion')
  async detalle(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.importacionesService.obtenerDetalle(client, hotelId, id);
  }

  @Post(':id/reprocesar')
  @Roles('admin', 'recepcion')
  async reprocesar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.importacionesService.reprocesar(client, hotelId, id, user.personalId);
  }
}
