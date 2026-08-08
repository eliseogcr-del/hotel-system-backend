import { IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Body opcional del checkout. Si cobroLateManual no viene, el servicio lo
 * calcula solo (50% de la tarifa diaria si la salida real es posterior a
 * hora_checkout del hotel). Enviar 0 explícito para anularlo.
 */
export class CheckoutDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  cobroLateManual?: number;
}
