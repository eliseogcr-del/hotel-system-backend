import { IsDateString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class CrearTarifaDto {
  @IsUUID()
  tipoHabId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimo?: number;

  @IsNumber()
  @Min(0)
  normal: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  booking?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  airbnb?: number;

  // Si no se envía, rige desde hoy.
  @IsOptional()
  @IsDateString()
  vigenteDesde?: string;
}
