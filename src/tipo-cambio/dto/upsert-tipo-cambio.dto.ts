import { IsDateString, IsNumber, Min } from 'class-validator';

export class UpsertTipoCambioDto {
  @IsDateString()
  fecha: string;

  @IsNumber()
  @Min(0)
  valorCompra: number;

  @IsNumber()
  @Min(0)
  valorVenta: number;
}
