import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { RolHotel } from '../../common/interfaces/request-user.interface';

export class ActualizarAsignacionDto {
  @IsOptional()
  @IsEnum(['admin', 'recepcion', 'hk'])
  rol?: RolHotel;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
