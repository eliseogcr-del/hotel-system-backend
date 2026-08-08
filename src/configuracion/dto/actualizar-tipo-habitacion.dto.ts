import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioNormal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioCorporativo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioWeb?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioPorHora?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioCosto?: number;
}
