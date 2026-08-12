import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { TurnosService } from './turnos.service';
import { CrearTurnoDto } from './dto/crear-turno.dto';
import { ActualizarTurnoDto } from './dto/actualizar-turno.dto';

@Controller('hoteles/:hotelId/turnos')
@UseGuards(AuthGuard, RolesGuard)
export class TurnosController {
  constructor(
    private readonly turnosService: TurnosService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearTurnoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.turnosService.crear(client, hotelId, dto);
  }

  @Get()
  @Roles('admin')
  async listar(@Param('hotelId') hotelId: string, @CurrentUser() user: RequestUser) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.turnosService.listar(client, hotelId);
  }

  @Patch(':id')
  @Roles('admin')
  async actualizar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarTurnoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.turnosService.actualizar(client, hotelId, id, dto);
  }
}
