import { IsInt, IsUUID, Min } from 'class-validator';

export class CrearHabitacionDto {
  @IsInt()
  @Min(1)
  habNumero: number;

  @IsUUID()
  tipoId: string;

  @IsInt()
  @Min(1)
  piso: number;
}
