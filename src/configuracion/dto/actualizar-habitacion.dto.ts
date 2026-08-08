import { IsBoolean, IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class ActualizarHabitacionDto {
  @IsOptional()
  @IsUUID()
  tipoId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  piso?: number;

  @IsOptional()
  @IsEnum(['disponible', 'ocupada', 'limpieza', 'mantenimiento', 'bloqueada'])
  estado?: string;

  @IsOptional()
  @IsBoolean()
  mantenimientoPlanificado?: boolean;
}
