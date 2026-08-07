import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { RolHotel } from '../../common/interfaces/request-user.interface';

export class CrearPersonalDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  usuario: string;

  @IsEmail()
  email: string;

  @IsEnum(['admin', 'recepcion', 'hk'])
  rol: RolHotel;

  // Si no se envía, se genera una contraseña aleatoria y se devuelve en la
  // respuesta (una única vez) para que el admin se la pase a la persona.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
