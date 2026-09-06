import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CrearCotizacionDetalleDto } from './crear-cotizacion-detalle.dto';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CrearCotizacionDto {
  @IsOptional()
  @IsUUID()
  huespedId?: string;

  @IsOptional()
  @IsUUID()
  empresaId?: string;

  @IsDateString()
  fechaDesde: string;

  @IsDateString()
  fechaHasta: string;

  // HH:MM -- mismas horas con las que se validó disponibilidad en el
  // cuadro (ver DisponibilidadCotizacionDto), se guardan para poder
  // reconstruir el rango exacto al convertir la cotización en reserva.
  @Matches(HORA_REGEX, { message: 'horaCheckin debe tener formato HH:MM' })
  horaCheckin: string;

  @Matches(HORA_REGEX, { message: 'horaCheckout debe tener formato HH:MM' })
  horaCheckout: string;

  @IsOptional()
  @IsEnum(['PEN', 'USD'])
  moneda?: 'PEN' | 'USD';

  @IsOptional()
  @IsDateString()
  venceEn?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearCotizacionDetalleDto)
  habitaciones: CrearCotizacionDetalleDto[];
}
