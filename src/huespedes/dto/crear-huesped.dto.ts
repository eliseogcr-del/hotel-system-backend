import { IsDateString, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export type TipoDocHuesped = 'dni' | 'pasaporte' | 'carnet_extranjeria' | 'cedula' | 'otro';
export type NacionalidadHuesped = 'peruano' | 'extranjero';

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
  @IsEnum(['peruano', 'extranjero'])
  nacionalidad?: NacionalidadHuesped;

  // País de origen -- solo tiene sentido si nacionalidad='extranjero'.
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

  // RUC del huésped o de la empresa que paga su estadía (para factura).
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'El RUC debe tener 11 dígitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  razonSocial?: string;
}
