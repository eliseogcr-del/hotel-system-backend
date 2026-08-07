import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class ProcesarCorreoDto {
  @IsEnum(['booking', 'airbnb'])
  canal: 'booking' | 'airbnb';

  @IsOptional()
  @IsString()
  correoOrigen?: string;

  @IsString()
  @MinLength(1)
  cuerpoCorreo: string;
}
