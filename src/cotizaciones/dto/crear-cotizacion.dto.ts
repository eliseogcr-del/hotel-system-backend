import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CrearCotizacionDetalleDto } from './crear-cotizacion-detalle.dto';

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
