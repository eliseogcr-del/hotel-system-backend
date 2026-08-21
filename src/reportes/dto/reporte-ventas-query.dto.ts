import { IsDateString } from 'class-validator';

export class ReporteVentasQueryDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;
}
