import { IsBoolean, IsMilitaryTime, IsOptional } from 'class-validator';

export class ActualizarHotelDto {
  @IsOptional()
  @IsMilitaryTime()
  horaCheckin?: string;

  @IsOptional()
  @IsMilitaryTime()
  horaCheckout?: string;

  @IsOptional()
  @IsBoolean()
  modo24h?: boolean;
}
