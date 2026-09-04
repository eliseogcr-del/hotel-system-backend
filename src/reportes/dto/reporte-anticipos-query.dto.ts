import { IsDateString } from 'class-validator';

export class ReporteAnticiposQueryDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;
}
