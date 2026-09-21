import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TipoNota } from './crear-nota.dto';

export class ListarNotasQueryDto {
  // Filtran fecha_hora (cuándo se escribió la nota), en calendario Lima --
  // ver fechaLimaAInstante() en notas.service.ts. Por defecto el frontend
  // manda las de hoy.
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsEnum(TipoNota)
  tipo?: TipoNota;
}
