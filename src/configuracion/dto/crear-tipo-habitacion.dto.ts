import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CrearTipoHabitacionDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsInt()
  @Min(1)
  aforoMax: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  tiempoLimpiezaMin?: number;
}
