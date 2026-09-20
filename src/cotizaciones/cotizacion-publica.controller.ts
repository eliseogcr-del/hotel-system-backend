import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CotizacionPublicaService } from './cotizacion-publica.service';
import { CrearCotizacionWhatsappDto } from './dto/crear-cotizacion-whatsapp.dto';
import { HabitacionesDisponiblesWhatsappDto } from './dto/habitaciones-disponibles-whatsapp.dto';
import { CrearReservaWhatsappDto } from './dto/crear-reserva-whatsapp.dto';

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

  // El formulario público lo llama al cargar, para mostrar la hora de
  // check-in/checkout configurada del hotel como valor por defecto y avisar
  // de una vez si el agente no está activo.
  @Get('info')
  async info(@Param('hotelId') hotelId: string) {
    return this.service.obtenerInfoPublica(hotelId);
  }

  @Post()
  async crear(@Param('hotelId') hotelId: string, @Body() dto: CrearCotizacionWhatsappDto) {
    return this.service.crearDesdeWhatsapp(hotelId, dto);
  }

  // El formulario lo llama en cuanto el cliente completa fecha de
  // entrada/salida y personas, para mostrar la lista de habitaciones reales
  // disponibles con checkboxes (ver CLAUDE.md, agente de WhatsApp).
  @Post('habitaciones-disponibles')
  async habitacionesDisponibles(
    @Param('hotelId') hotelId: string,
    @Body() dto: HabitacionesDisponiblesWhatsappDto,
  ) {
    return this.service.buscarHabitacionesDisponibles(hotelId, dto);
  }

  // Botón "Reservar" del nuevo flujo: crea la reserva real directo (no una
  // cotización), con origen='whatsapp' para que el calendario la distinga.
  @Post('reservas')
  async crearReserva(@Param('hotelId') hotelId: string, @Body() dto: CrearReservaWhatsappDto) {
    return this.service.crearReservaDesdeWhatsapp(hotelId, dto);
  }
}
