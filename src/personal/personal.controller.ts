import {
  Body,
  Controller,
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
import { PersonalService } from './personal.service';
import { CrearPersonalDto } from './dto/crear-personal.dto';
import { AsignarPersonalDto } from './dto/asignar-personal.dto';
import { ActualizarAsignacionDto } from './dto/actualizar-asignacion.dto';

@Controller('hoteles/:hotelId/personal')
@UseGuards(AuthGuard, RolesGuard)
export class PersonalController {
  constructor(
    private readonly personalService: PersonalService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post()
  @Roles('admin')
  async crear(
    @Param('hotelId') hotelId: string,
    @Body() dto: CrearPersonalDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.personalService.crear(client, hotelId, dto);
  }

  @Post(':personalId/asignar')
  @Roles('admin')
  async asignar(
    @Param('hotelId') hotelId: string,
    @Param('personalId') personalId: string,
    @Body() dto: AsignarPersonalDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.personalService.asignar(client, hotelId, personalId, dto);
  }

  @Get()
  @Roles('admin')
  async listar(
    @Param('hotelId') hotelId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.personalService.listar(client, hotelId);
  }

  @Patch(':personalHotelId')
  @Roles('admin')
  async actualizarAsignacion(
    @Param('hotelId') hotelId: string,
    @Param('personalHotelId') personalHotelId: string,
    @Body() dto: ActualizarAsignacionDto,
    @CurrentUser() user: RequestUser,
  ) {
    const client = this.supabase.getClientForRequest(user.accessToken);
    return this.personalService.actualizarAsignacion(client, hotelId, personalHotelId, dto);
  }
}
