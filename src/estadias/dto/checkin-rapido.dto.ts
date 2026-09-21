import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
} from 'class-validator';
import { OrigenReserva } from '../../reservas/dto/crear-reserva.dto';

export type TipoDocHuesped = 'dni' | 'pasaporte' | 'carnet_extranjeria' | 'cedula' | 'otro';
export type NacionalidadHuesped = 'peruano' | 'extranjero';

/**
 * Check-in directo desde el panel de Habitaciones: busca al huésped por
 * documento en la base propia del hotel (huespedes.nro_doc) y, si no
 * existe, lo crea con los datos que trae el formulario. Arma internamente
 * una reserva 'walkin' de 1 línea + el check-in inmediato, reutilizando
 * ReservasService.crear() y este mismo EstadiasService.checkin().
 */
export class CheckinRapidoDto {
  @IsUUID(undefined, { message: 'Selecciona una habitación válida.' })
  habitacionId: string;

  @IsString()
  @MinLength(1, { message: 'Falta el número de documento (DNI/pasaporte) del huésped.' })
  nroDoc: string;

  @IsOptional()
  @IsEnum(['dni', 'pasaporte', 'carnet_extranjeria', 'cedula', 'otro'], {
    message: 'Selecciona un tipo de documento válido (DNI, pasaporte, carné de extranjería, cédula u otro).',
  })
  tipoDoc?: TipoDocHuesped;

  // Requeridos solo si el huésped no existe todavía en la base del hotel.
  @IsOptional()
  @IsString()
  nombres?: string;

  @IsOptional()
  @IsString()
  apellidos?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  correo?: string;

  @IsOptional()
  @IsEnum(['peruano', 'extranjero'])
  nacionalidad?: NacionalidadHuesped;

  // País de origen -- solo tiene sentido si nacionalidad='extranjero'.
  @IsOptional()
  @IsString()
  origen?: string;

  @IsOptional()
  @IsISO8601()
  fechaNacimiento?: string;

  // RUC del huésped o de la empresa que paga su estadía (para factura).
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsInt()
  @Min(1, { message: 'La cantidad de personas debe ser al menos 1.' })
  nroPersonas: number;

  // Tarifa por día editable por recepción (por defecto llega precargada con
  // la tarifa 'normal' del tipo de habitación, calculada en el frontend).
  @IsNumber()
  @Min(0, { message: 'La tarifa por día no puede ser negativa.' })
  tarifaDia: number;

  @IsInt()
  @Min(1, { message: 'La cantidad de días debe ser al menos 1.' })
  dias: number;

  @IsISO8601(undefined, { message: 'La fecha/hora de check-in no es válida.' })
  checkinPrevisto: string;

  // Si no viene, se calcula solo: 50% de tarifaDia si el ingreso es antes
  // de hora_checkin del hotel. Enviar 0 explícito para anularlo desde el
  // formulario.
  @IsOptional()
  @IsNumber()
  @Min(0)
  cobroEarlyManual?: number;

  // Desayuno de cortesía incluido en la tarifa (no genera ningún cargo).
  @IsOptional()
  @IsBoolean()
  incluyeDesayuno?: boolean;

  // Si se le va a emitir boleta/factura al cliente. Por defecto false.
  @IsOptional()
  @IsBoolean()
  facturable?: boolean;

  @IsOptional()
  @IsUUID()
  cocheraId?: string;

  @IsOptional()
  @IsString()
  vehiculoMarca?: string;

  @IsOptional()
  @IsString()
  vehiculoTipo?: string;

  @IsOptional()
  @IsString()
  vehiculoPlaca?: string;

  // Canal por el que llegó el huésped (reservas.origen). Se llama distinto
  // de 'origen' a propósito: ese campo ya significa "país de origen" del
  // huésped extranjero, arriba. Si no viene, se asume 'walkin' (llegó
  // directo al mostrador sin reserva previa), pero se puede indicar otro
  // (ej. llamó por teléfono y se atendió el check-in directo sin pasar por
  // el módulo de Reservas).
  @IsOptional()
  @IsEnum(['telefono', 'whatsapp', 'booking', 'airbnb', 'directo', 'walkin'], {
    message: 'Selecciona un origen de reserva válido.',
  })
  origenReserva?: OrigenReserva;

  // Notas libres sobre esta línea (mismo campo 'Observaciones' del
  // formulario de Reservas).
  @IsOptional()
  @IsString()
  observaciones?: string;
}
