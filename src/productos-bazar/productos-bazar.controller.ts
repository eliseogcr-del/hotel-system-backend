import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ProductosBazarService } from './productos-bazar.service';
import { CrearProductoBazarDto } from './dto/crear-producto-bazar.dto';
import { ActualizarProductoBazarDto } from './dto/actualizar-producto-bazar.dto';

@Controller('hoteles/:hotelId/productos-bazar')
@UseGuards(AuthGuard, RolesGuard)
export class ProductosBazarController {
  constructor(
    private readonly productosBazarService: ProductosBazarService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearProductoBazarDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.productosBazarService.crear(client, hotelId, dto);
  }

  // El catálogo lo lee recepción para poder vender, no solo el admin.
  @Get()
  @Roles('admin', 'recepcion')
  async listar(@Param('hotelId') hotelId: string, @CurrentUser() user: RequestUser) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.productosBazarService.listar(client, hotelId);
  }

  @Patch(':id')
  @Roles('admin')
  async actualizar(
    @Param('hotelId') hotelId: string,
    @Param('id') id: string,
    @Body() dto: ActualizarProductoBazarDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.productosBazarService.actualizar(client, hotelId, id, dto);
  }
}
