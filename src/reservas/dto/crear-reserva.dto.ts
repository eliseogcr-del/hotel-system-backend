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

  @IsOptional()
  @IsNumber()
  @Min(0)
  descuentoTotal?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrearReservaHabitacionDto)
  habitaciones: CrearReservaHabitacionDto[];
}
