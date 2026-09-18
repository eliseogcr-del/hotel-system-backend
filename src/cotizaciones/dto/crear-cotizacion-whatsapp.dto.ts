import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Lo llena el cliente en el formulario público que le manda el agente de
 * WhatsApp (sin login) -- ver CotizacionPublicaController. Todo lo que
 * llega acá es de un desconocido, así que se valida más estricto que los
 * DTOs internos (topes de tamaño/cantidad, nada opcional que dependa de
 * confiar en el remitente).
 */
export class CrearCotizacionWhatsappDto {
  @IsEnum(['dni', 'pasaporte', 'carnet_extranjeria', 'cedula', 'otro'])
  tipoDoc: 'dni' | 'pasaporte' | 'carnet_extranjeria' | 'cedula' | 'otro';

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  nroDoc: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombres: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  apellidos: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono: string;

  @IsDateString()
  fechaIngreso: string;

  @Matches(HORA_REGEX, { message: 'horaIngreso debe tener formato HH:MM' })
  horaIngreso: string;

  @IsInt()
  @Min(1)
  @Max(60)
  noches: number;

  @IsInt()
  @Min(1)
  @Max(500)
  personas: number;

  // Si el cliente quiere cambiar la fecha/hora de salida en vez de aceptar
  // el checkout estándar del hotel (default 12:00) -- cambia noches y puede
  // generar un cargo de late (50% de la tarifa de esa noche) si la hora
  // queda después del checkout configurado. Si no vienen, se calculan solas
  // desde fechaIngreso + noches y la hora de checkout del hotel.
  @IsOptional()
  @IsDateString()
  fechaSalida?: string;

  @IsOptional()
  @Matches(HORA_REGEX, { message: 'horaSalida debe tener formato HH:MM' })
  horaSalida?: string;

  @IsBoolean()
  mascota: boolean;

  @IsBoolean()
  vehiculo: boolean;

  @ValidateIf((o) => o.vehiculo === true)
  @IsEnum(['auto', 'camioneta', 'moto', 'otro'])
  tipoVehiculo?: 'auto' | 'camioneta' | 'moto' | 'otro';

  @IsBoolean()
  facturable: boolean;

  @ValidateIf((o) => o.facturable === true)
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  ruc?: string;

  @ValidateIf((o) => o.facturable === true)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razonSocial?: string;
}
