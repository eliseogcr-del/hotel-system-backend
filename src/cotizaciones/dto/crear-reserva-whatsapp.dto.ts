import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';
import { CrearCotizacionWhatsappDto } from './crear-cotizacion-whatsapp.dto';

/**
 * Body del botón "Reservar" del formulario público: el cliente ya vio la
 * lista de habitaciones realmente disponibles (ver
 * HabitacionesDisponiblesWhatsappDto/buscarHabitacionesDisponibles) y marcó
 * cuáles quiere. A propósito NO viaja de vuelta ni precio ni aforo -- eso
 * siempre se recalcula del lado del servidor a partir de habitacionIds (ver
 * CotizacionPublicaService.crearReservaDesdeWhatsapp), para que el cliente
 * nunca pueda alterarlos.
 */
export class CrearReservaWhatsappDto extends CrearCotizacionWhatsappDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  habitacionIds: string[];
}
