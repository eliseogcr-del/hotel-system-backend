import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces/request-user.interface';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ReportesService } from './reportes.service';
import { ReporteCajaQueryDto } from './dto/reporte-caja-query.dto';
import { ReporteVentasQueryDto } from './dto/reporte-ventas-query.dto';
import { ReporteOcupabilidadQueryDto } from './dto/reporte-ocupabilidad-query.dto';
import { ReporteAnticiposQueryDto } from './dto/reporte-anticipos-query.dto';

// Solo admin: reportes consolidados de todo el hotel (todas las
// recepcionistas), a diferencia de Caja que cada quien solo ve la suya.
@Controller('hoteles/:hotelId/reportes')
@UseGuards(AuthGuard, RolesGuard)
export class ReportesController {
  constructor(
    private readonly reportesService: ReportesService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get('caja')
  @Roles('admin')
  async reporteCaja(
    @Param('hotelId') hotelId: string,
    @Query() query: ReporteCajaQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reportesService.reporteCaja(client, hotelId, query.fecha, query.turnoId);
  }

  @Get('ventas-diarias')
  @Roles('admin')
  async ventasDiarias(
    @Param('hotelId') hotelId: string,
    @Query() query: ReporteVentasQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reportesService.ventasDiarias(client, hotelId, query.desde, query.hasta);
  }

  @Get('anticipos')
  @Roles('admin')
  async anticipos(
    @Param('hotelId') hotelId: string,
    @Query() query: ReporteAnticiposQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reportesService.anticiposDiarios(client, hotelId, query.desde, query.hasta);
  }

  @Get('ocupabilidad')
  @Roles('admin')
  async ocupabilidad(
    @Param('hotelId') hotelId: string,
    @Query() query: ReporteOcupabilidadQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.reportesService.reporteOcupabilidad(client, hotelId, query.desde, query.hasta);
  }
}
