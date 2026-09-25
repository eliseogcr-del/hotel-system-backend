import { IsEnum, IsString, MinLength } from 'class-validator';

export class BuscarHuespedPublicoDto {
  @IsEnum(['dni', 'pasaporte', 'carnet_extranjeria', 'cedula', 'otro'])
  tipoDoc: string;

  @IsString()
  @MinLength(1)
  nroDoc: string;
}
