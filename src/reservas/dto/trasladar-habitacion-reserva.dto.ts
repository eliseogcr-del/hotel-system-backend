import { IsUUID } from 'class-validator';

/**
 * Traslado de una línea de reserva (todavía sin check-in) a otra
 * habitación -- mismas fechas, no necesariamente mismo tipo de habitación
 * (eso solo se informa, ver ReservasService.trasladarHabitacionLinea).
 */
export class TrasladarHabitacionReservaDto {
  @IsUUID()
  nuevaHabitacionId: string;
}
