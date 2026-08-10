import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { TiposDesayunoService } from './tipos-desayuno.service';
import { CrearTipoDesayunoDto } from './dto/crear-tipo-desayuno.dto';
import { ActualizarTipoDesayunoDto } from './dto/actualizar-tipo-desayuno.dto';

@Controller('hoteles/:hotelId/tipos-desayuno')
@UseGuards(AuthGuard, RolesGuard)
export class TiposDesayunoController {
  constructor(
    private readonly tiposDesayunoService: TiposDesayunoService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearTipoDesayunoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tiposDesayunoService.crear(client, hotelId, dto);
  }

  // El catálogo lo lee recepción para poder vender, no solo el admin.
  @Get()
  @Roles('admin', 'recepcion')
  async listar(@Param('hotelId') hotelId: string, @CurrentUser() user: RequestUser) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tiposDesayunoService.listar(client, hotelId);
  }

  @Patch(':id')
  @Roles('admin')
  async actualizar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarTipoDesayunoDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tiposDesayunoService.actualizar(client, hotelId, id, dto);
  }
}
