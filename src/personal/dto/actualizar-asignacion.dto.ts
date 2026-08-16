import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RolHotel } from '../../common/interfaces/request-user.interface';

export class ActualizarAsignacionDto {
  @IsOptional()
  @IsEnum(['admin', 'recepcion', 'hk'])
  rol?: RolHotel;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  // Cambian la cuenta de Supabase Auth de la persona (no la asignación en sí).
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
