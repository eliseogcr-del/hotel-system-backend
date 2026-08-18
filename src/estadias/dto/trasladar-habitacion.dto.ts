import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Traslado de un huésped en curso a otra habitación disponible (ej. no le
 * gustó la asignada). habitacionQuedaLimpia decide qué pasa con la
 * habitación que deja: 'disponible' directo, o 'limpieza' + tarea HK (mismo
 * flujo que checkout()).
 */
export class TrasladarHabitacionDto {
  @IsUUID()
  nuevaHabitacionId: string;

  @IsBoolean()
  habitacionQuedaLimpia: boolean;

  @IsOptional()
  @IsString()
  motivo?: string;
}
