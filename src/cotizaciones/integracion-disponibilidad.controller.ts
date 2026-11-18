import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { WhatsappApiKeyGuard } from '../common/guards/whatsapp-api-key.guard';
import { CotizacionPublicaService } from './cotizacion-publica.service';
import { HabitacionesDisponiblesWhatsappDto } from './dto/habitaciones-disponibles-whatsapp.dto';

/**
 * Ruta servidor-a-servidor para integraciones externas (ej. un asistente de
 * IA en otra plataforma) que solo necesitan consultar disponibilidad -- a
 * diferencia de CotizacionPublicaController (sin guard de clave a
 * propósito: lo llama el formulario público /cotizar/:hotelId directo
 * desde el navegador del cliente final, que no puede guardar un secreto),
 * esta ruta exige WhatsappApiKeyGuard. Autoriza distinto, a propósito:
 * buscarDisponibilidadIntegracion() solo exige hoteles.activo (no
 * agente_whatsapp_activo, que es el interruptor del formulario público --
 * un control de negocio aparte) -- pero comparte con la ruta pública la
 * misma búsqueda real (buscarHabitacionesDisponiblesCore(), sin duplicar
 * lógica de disponibilidad/precio) y el mismo contrato de entrada/salida.
 */
@Controller('integraciones/hoteles/:hotelId/disponibilidad')
@UseGuards(WhatsappApiKeyGuard, ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class IntegracionDisponibilidadController {
  constructor(private readonly service: CotizacionPublicaService) {}

  @Post()
  async consultar(
    @Param('hotelId') hotelId: string,
    @Body() dto: HabitacionesDisponiblesWhatsappDto,
  ) {
    return this.service.buscarDisponibilidadIntegracion(hotelId, dto);
  }
}
