import { IsEnum } from 'class-validator';
import { RolHotel } from '../../common/interfaces/request-user.interface';

export class AsignarPersonalDto {
  @IsEnum(['admin', 'recepcion', 'hk'])
  rol: RolHotel;
}
