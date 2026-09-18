import { Body, Controller, Param, Post } from '@nestjs/common';
import { CotizacionPublicaService } from './cotizacion-publica.service';
import { CrearCotizacionWhatsappDto } from './dto/crear-cotizacion-whatsapp.dto';

/**
 * Sin AuthGuard/RolesGuard a propósito: lo abre un cliente desde el link que
 * le manda el agente de WhatsApp, sin login (ver CLAUDE.md, agente de
 * WhatsApp). Se protege validando que el hotel exista y tenga
 * agente_whatsapp_activo=true (CotizacionPublicaService.cargarHotelConBotActivo),
 * no con un token de Supabase -- mismo criterio de "sin usuario logueado"
 * que ya usa BookingInboxController, pero acá el llamador es un desconocido
 * real, así que el DTO valida más estricto (ver CrearCotizacionWhatsappDto).
 */
@Controller('publico/hoteles/:hotelId/cotizaciones-whatsapp')
export class CotizacionPublicaController {
  constructor(private readonly service: CotizacionPublicaService) {}

  @Post()
  async crear(@Param('hotelId') hotelId: string, @Body() dto: CrearCotizacionWhatsappDto) {
    return this.service.crearDesdeWhatsapp(hotelId, dto);
  }
}
