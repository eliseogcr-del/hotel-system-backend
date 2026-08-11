import { IsDateString } from 'class-validator';

export class CalendarioQueryDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;
}
