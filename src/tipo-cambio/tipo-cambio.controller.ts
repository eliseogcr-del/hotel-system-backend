import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { TipoCambioService } from './tipo-cambio.service';
import { UpsertTipoCambioDto } from './dto/upsert-tipo-cambio.dto';

@Controller('hoteles/:hotelId/tipo-cambio')
@UseGuards(AuthGuard, RolesGuard)
export class TipoCambioController {
  constructor(
    private readonly tipoCambioService: TipoCambioService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin')
  async upsert(
    @Param('hotelId') hotelId: string,
    @Body() dto: UpsertTipoCambioDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tipoCambioService.upsert(client, dto);
  }

  @Get()
  @Roles('admin')
  async listar(@Param('hotelId') hotelId: string, @CurrentUser() user: RequestUser) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tipoCambioService.listar(client);
  }

  // Lo lee todo el personal (recepción/hk incluidos): se muestra siempre
  // arriba en toda la app.
  @Get('vigente')
  @Roles('admin', 'recepcion', 'hk')
  async vigente(@Param('hotelId') hotelId: string, @CurrentUser() user: RequestUser) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.tipoCambioService.obtenerVigente(client);
  }

  // Cualquier rol lo puede disparar (el frontend lo hace solo -- ver
  // Layout.tsx -- cuando el tipo de cambio guardado no es el de hoy): usa
  // el cliente de servicio porque el dato viene de SUNAT, no del usuario,
  // así que no hace falta ser admin para activarlo.
  @Post('sincronizar')
  @Roles('admin', 'recepcion', 'hk')
  async sincronizar(@Param('hotelId') hotelId: string) {
    const client = this.supabase.getServiceClient();
    return this.tipoCambioService.sincronizarDesdeSunat(client);
  }
}
