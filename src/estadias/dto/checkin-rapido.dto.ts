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
  @IsUUID()
  habitacionId: string;

  @IsString()
  @MinLength(1)
  nroDoc: string;

  @IsOptional()
  @IsEnum(['dni', 'pasaporte', 'carnet_extranjeria', 'cedula', 'otro'])
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
  @Min(1)
  nroPersonas: number;

  // Tarifa por día editable por recepción (por defecto llega precargada con
  // la tarifa 'normal' del tipo de habitación, calculada en el frontend).
  @IsNumber()
  @Min(0)
  tarifaDia: number;

  @IsInt()
  @Min(1)
  dias: number;

  @IsISO8601()
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
}
