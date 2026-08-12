import { IsMilitaryTime, IsNotEmpty, IsString } from 'class-validator';

export class CrearTurnoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsMilitaryTime()
  horaInicio: string;

  @IsMilitaryTime()
  horaFin: string;
}
