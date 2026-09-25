import { IsUUID } from 'class-validator';

export class MarcarSinMantenimientoDto {
  @IsUUID()
  habitacionId: string;
}
