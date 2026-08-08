import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ActualizarTipoHabitacionDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  aforoMax?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tiempoLimpiezaMin?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
