import { IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type TipoDocHuesped = 'dni' | 'pasaporte' | 'carnet_extranjeria' | 'cedula' | 'otro';

export class CrearHuespedDto {
  @IsEnum(['dni', 'pasaporte', 'carnet_extranjeria', 'cedula', 'otro'])
  tipoDoc: TipoDocHuesped;

  @IsString()
  @IsNotEmpty()
  nroDoc: string;

  @IsString()
  @IsNotEmpty()
  nombres: string;

  @IsString()
  @IsNotEmpty()
  apellidos: string;

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
