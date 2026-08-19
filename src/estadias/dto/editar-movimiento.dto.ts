import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export class EditarMovimientoDto {
  @IsNumber()
  monto: number;

  @IsOptional()
  @IsEnum(['efectivo', 'transferencia', 'yape', 'tarjeta'])
  metodoPago?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
