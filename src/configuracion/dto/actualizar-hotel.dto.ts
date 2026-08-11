import { IsBoolean, IsMilitaryTime, IsNumber, IsOptional, Min } from 'class-validator';

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

  // Cobro por mascota, por día. 0 = sin cobro configurado todavía.
  @IsOptional()
  @IsNumber()
  @Min(0)
  precioMascota?: number;
}
