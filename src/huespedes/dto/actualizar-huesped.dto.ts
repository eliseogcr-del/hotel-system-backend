import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { NacionalidadHuesped, TipoDocHuesped } from './crear-huesped.dto';

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
  @IsEnum(['peruano', 'extranjero'])
  nacionalidad?: NacionalidadHuesped;

  @IsOptional()
  @IsString()
  origen?: string;

  @IsOptional()
  @IsDateString()
  fechaNacimiento?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  correo?: string;

  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;
}
