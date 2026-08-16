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

  // Solo editable mientras el hotel no tenga ninguna sesión de caja
  // todavía (ver ConfiguracionService.actualizarHotel()).
  @IsOptional()
  @IsNumber()
  @Min(0)
  saldoInicialCaja?: number;
}
