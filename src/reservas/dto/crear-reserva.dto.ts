import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CrearReservaHabitacionDto } from './crear-reserva-habitacion.dto';

export type OrigenReserva =
  | 'telefono'
  | 'whatsapp'
  | 'booking'
  | 'airbnb'
  | 'directo'
  | 'walkin';

export class CrearReservaDto {
  @IsOptional()
  @IsUUID()
  huespedId?: string;

  @IsOptional()
  @IsUUID()
  empresaId?: string;

  @IsEnum(['telefono', 'whatsapp', 'booking', 'airbnb', 'directo', 'walkin'])
  origen: OrigenReserva;

  @IsOptional()
  @IsString()
  codigoExterno?: string;

  @IsOptional()
  @IsEnum(['PEN', 'USD'])
  moneda?: 'PEN' | 'USD';

  @IsOptional()
  @IsBoolean()
  deducibleImpuestos?: boolean;

  // Si se le va a emitir boleta/factura al cliente. No confundir con la
  // tabla `comprobantes` (el comprobante ya emitido en sí) -- esto es solo
  // la intención, útil para filtrar/planificar. Se copia a estadias.facturable
  // al hacer check-in (ver EstadiasService.checkin()) y queda editable
  // aparte desde ahí en adelante.
  @IsOptional()
  @IsBoolean()
  facturable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuentoTotal?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearReservaHabitacionDto)
  habitaciones: CrearReservaHabitacionDto[];

  // Anticipo (pago adelantado) de la reserva, opcional. El método de pago
  // decide si toca la caja: solo 'efectivo' genera un ingreso en la sesión
  // de turno abierta de quien registra la reserva (ver
  // ReservasService.procesarAnticipo()).
  @IsOptional()
  @IsNumber()
  @Min(0)
  anticipoMonto?: number;

  @IsOptional()
  @IsEnum(['efectivo', 'transferencia', 'yape', 'tarjeta'])
  anticipoMetodoPago?: 'efectivo' | 'transferencia' | 'yape' | 'tarjeta';
}
