import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class ListarImportacionesQueryDto {
  @IsOptional()
  @IsEnum(['booking', 'airbnb'])
  canal?: string;

  @IsOptional()
  @IsEnum(['pendiente', 'ok', 'error'])
  estadoParseo?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
