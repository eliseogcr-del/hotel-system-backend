import { IsEnum, IsOptional } from 'class-validator';

export class ListarImportacionesQueryDto {
  @IsOptional()
  @IsEnum(['booking', 'airbnb'])
  canal?: string;

  @IsOptional()
  @IsEnum(['pendiente', 'ok', 'error'])
  estadoParseo?: string;
}
