import { IsDateString, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Body para que el formulario público consulte, en cuanto el cliente llena
 * fecha de entrada + salida (o noches) + personas, la lista de habitaciones
 * REALES disponibles para ese rango -- ver
 * CotizacionPublicaService.buscarHabitacionesDisponibles(). Mismos campos
 * de fecha/hora que CrearCotizacionWhatsappDto para reutilizar
 * resolverFechas().
 */
export class HabitacionesDisponiblesWhatsappDto {
  @IsDateString()
  fechaIngreso: string;

  @Matches(HORA_REGEX, { message: 'horaIngreso debe tener formato HH:MM' })
  horaIngreso: string;

  @IsInt()
  @Min(1)
  @Max(60)
  noches: number;

  @IsInt()
  @Min(1)
  @Max(500)
  personas: number;

  @IsOptional()
  @IsDateString()
  fechaSalida?: string;

  @IsOptional()
  @Matches(HORA_REGEX, { message: 'horaSalida debe tener formato HH:MM' })
  horaSalida?: string;
}
