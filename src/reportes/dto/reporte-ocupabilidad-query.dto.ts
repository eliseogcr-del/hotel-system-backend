import { IsDateString } from 'class-validator';

export class ReporteOcupabilidadQueryDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;
}
