import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export type TipoAlquiler = 'pernocte' | 'por_horas';

/**
 * Una línea = una habitación dentro de la reserva (una reserva puede
 * incluir varias habitaciones a la vez, ej. reservas grupales).
 */
export class CrearReservaHabitacionDto {
  @IsUUID()
  habitacionId: string;

  @IsInt()
  @Min(1)
  nroPersonas: number;

  @IsOptional()
  @IsBoolean()
  incluyeDesayuno?: boolean;

  @IsEnum(['pernocte', 'por_horas'])
  tipoAlquiler: TipoAlquiler;

  @IsISO8601()
  checkinPrevisto: string;

  @IsISO8601()
  checkoutPrevisto: string;

  // tarifa_dia es editable por diseño (ver CLAUDE.md 3.3): si no viene,
  // se calcula sola a partir de tarifas + origen + tipoAlquiler.
  @IsOptional()
  @IsNumber()
  @Min(0)
  tarifaDiaManual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cargoAforoExtra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cobroEarly?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cobroLate?: number;

  @IsOptional()
  @IsUUID()
  cocheraId?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsString()
  vehiculoPlaca?: string;

  @IsOptional()
  @IsString()
  vehiculoColor?: string;

  @IsOptional()
  @IsString()
  vehiculoCaracteristicas?: string;
}
