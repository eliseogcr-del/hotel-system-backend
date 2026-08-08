import { IsDateString, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoDocHuesped } from './crear-huesped.dto';

export class ActualizarHuespedDto {
  @IsOptional()
  @IsEnum(['dni', 'pasaporte', 'carnet_extranjeria', 'cedula', 'otro'])
  tipoDoc?: TipoDocHuesped;

  @IsOptional()
  @IsString()
  nroDoc?: string;

  @IsOptional()
  @IsString()
  nombres?: string;

  @IsOptional()
  @IsString()
  apellidos?: string;

  @IsOptional()
  @IsString()
  nacionalidad?: string;

  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  correo?: string;
}
