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
export type TipoCliente = 'normal' | 'corporativo' | 'web';

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

  // El recepcionista determina qué tipo de cliente es (empresa, cliente
  // web/OTA, o eventual/normal) y de ahí sale el precio por defecto
  // configurado en el tipo de habitación. Si no se envía, se infiere de
  // origen/empresaId (ver ReservasService.inferirTipoCliente).
  @IsOptional()
  @IsEnum(['normal', 'corporativo', 'web'])
  tipoCliente?: TipoCliente;

  // tarifa_dia es editable por diseño (ver CLAUDE.md 3.3): si no viene, se
  // calcula sola a partir del precio del tipo de habitación + tipoCliente +
  // tipoAlquiler. En cualquier caso (con o sin override) nunca puede quedar
  // por debajo del precio_costo configurado para ese tipo de habitación.
  @IsOptional()
  @IsNumber()
  @Min(0)
  tarifaDiaManual?: number;

  // Por defecto los días se derivan de checkinPrevisto/checkoutPrevisto
  // (ceil de la diferencia en horas). checkin-rápido necesita fijar el
  // número exacto de días que pidió el huésped: como el checkout previsto
  // se ancla a la hora_checkout del hotel (no a la hora real de llegada),
  // un check-in temprano puede hacer que esa diferencia caiga un poco por
  // encima de N días completos y el ceil sume una noche de más.
  @IsOptional()
  @IsInt()
  @Min(1)
  diasManual?: number;

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
