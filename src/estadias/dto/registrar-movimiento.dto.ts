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
  | 'cochera';

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
  @IsBoolean()
  pagadoAlMomento?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  cantidad?: number;

  @IsOptional()
  @IsString()
  notas?: string;
}
