import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export type TipoMovimientoCaja = 'ingreso' | 'egreso';
export type MetodoPago = 'efectivo' | 'transferencia' | 'yape' | 'tarjeta';

// Movimientos de caja "sueltos" (no ligados a una estadía): gastos operativos,
// vueltos, retiros, etc. Los ingresos por pago de huésped o consumo de bazar
// se generan solos desde EstadiasService.registrarMovimiento.
export class RegistrarMovimientoCajaDto {
  @IsEnum(['ingreso', 'egreso'])
  tipo: TipoMovimientoCaja;

  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsString()
  concepto: string;

  @IsOptional()
  @IsEnum(['efectivo', 'transferencia', 'yape', 'tarjeta'])
  metodoPago?: MetodoPago;

  @IsOptional()
  @IsString()
  notas?: string;
}
