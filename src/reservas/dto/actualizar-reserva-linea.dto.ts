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
import { OrigenReserva } from './crear-reserva.dto';

/**
 * Editar una reserva existente (todavía sin check-in) desde el formulario
 * del calendario -- misma línea de reserva_habitacion, no cambia la
 * habitación (eso implicaría mover la celda en el calendario, fuera de
 * alcance de este formulario).
 */
export class ActualizarReservaLineaDto {
  // Reasignar la reserva a otro huésped ya existente en el hotel (ej. se
  // registró bajo la persona equivocada). NUNCA edita los datos del
  // huésped encontrado -- eso se hace aparte, con PATCH /huespedes/:id,
  // porque ese registro puede estar compartido con otras reservas.
  @IsOptional()
  @IsUUID()
  nuevoHuespedId?: string;

  @IsOptional()
  @IsEnum(['telefono', 'whatsapp', 'booking', 'airbnb', 'directo', 'walkin'])
  origen?: OrigenReserva;

  @IsOptional()
  @IsEnum(['PEN', 'USD'])
  moneda?: 'PEN' | 'USD';

  @IsOptional()
  @IsBoolean()
  facturable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  nroPersonas?: number;

  @IsOptional()
  @IsBoolean()
  incluyeDesayuno?: boolean;

  @IsOptional()
  @IsBoolean()
  conMascota?: boolean;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsISO8601()
  checkinPrevisto?: string;

  // Días a hospedarse: el checkout se recalcula como checkin + dias.
  @IsOptional()
  @IsInt()
  @Min(1)
  diasManual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tarifaDiaManual?: number;

  @IsOptional()
  @IsString()
  vehiculoMarca?: string;

  @IsOptional()
  @IsString()
  vehiculoTipo?: string;

  @IsOptional()
  @IsString()
  vehiculoPlaca?: string;

  // Anticipo: solo se puede registrar una vez (ver ReservasService --
  // libro de una sola vía, igual que movimientos_cuenta). Si ya existe uno
  // en la reserva, un intento de cambiarlo se rechaza.
  @IsOptional()
  @IsNumber()
  @Min(0)
  anticipoMonto?: number;

  @IsOptional()
  @IsEnum(['efectivo', 'transferencia', 'yape', 'tarjeta'])
  anticipoMetodoPago?: 'efectivo' | 'transferencia' | 'yape' | 'tarjeta';
}
