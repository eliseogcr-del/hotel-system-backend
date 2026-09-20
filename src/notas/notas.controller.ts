import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { NotasService } from './notas.service';
import { CrearNotaDto } from './dto/crear-nota.dto';

@Controller('hoteles/:hotelId/notas')
@UseGuards(AuthGuard, RolesGuard)
export class NotasController {
  constructor(
    private readonly notasService: NotasService,
    private readonly supabase: SupabaseService,
  ) {}

  // Obtener todas las notas de un hotel
  @Get()
  @Roles('admin', 'recepcion', 'hk')
  async listar(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.notasService.listar(client, hotelId);
  }

  // Crear una nueva nota
  @Post()
  @Roles('admin', 'recepcion', 'hk')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearNotaDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.notasService.crear(client, hotelId, dto, user.personalId);
  }
}