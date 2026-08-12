import { IsBoolean, IsMilitaryTime, IsOptional, IsString } from 'class-validator';

export class ActualizarTurnoDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsMilitaryTime()
  horaInicio?: string;

  @IsOptional()
  @IsMilitaryTime()
  horaFin?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
