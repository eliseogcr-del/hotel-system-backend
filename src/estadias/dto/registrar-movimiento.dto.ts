import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export type TipoMovimientoCuenta =
  | 'alquiler'
  | 'consumo_bazar'
  | 'pago'
  | 'early'
  | 'late'
  | 'ajuste'
  | 'cochera'
  | 'desayuno'
  | 'mascota';

export type MetodoPago = 'efectivo' | 'transferencia' | 'yape' | 'tarjeta';

export class RegistrarMovimientoDto {
  @IsEnum([
    'alquiler',
    'consumo_bazar',
    'pago',
    'early',
    'late',
    'ajuste',
    'cochera',
    'desayuno',
    'mascota',
  ])
  tipo: TipoMovimientoCuenta;

  // Siempre se ingresa como valor positivo (salvo 'ajuste', que puede ser
  // negativo para corregir); el servicio decide el signo real según tipo:
  // 'pago' se guarda en negativo (abono), el resto en positivo (cargo).
  @IsNumber()
  monto: number;

  @IsOptional()
  @IsEnum(['efectivo', 'transferencia', 'yape', 'tarjeta'])
  metodoPago?: MetodoPago;

  @IsOptional()
  @IsUUID()
  productoId?: string;

  @IsOptional()
  @IsUUID()
  tipoDesayunoId?: string;

  @IsOptional()
  @IsBoolean()
  pagadoAlMomento?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  // Solo aplica a tipo='pago': si el huésped paga en dólares, el monto de
  // arriba se interpreta en USD y se convierte a soles con el tipo de
  // cambio (compra) vigente antes de guardarse -- el saldo y la caja
  // siempre quedan en soles. Por defecto 'PEN' (sin conversión).
  @IsOptional()
  @IsEnum(['PEN', 'USD'])
  moneda?: 'PEN' | 'USD';
}
