import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReporteCajaQueryDto {
  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsString()
  turnoId?: string;
}
