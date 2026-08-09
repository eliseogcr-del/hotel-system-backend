import { IsISO8601, IsNumber, IsOptional, Min } from 'class-validator';

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

  // Si no viene, se usa el momento en que llega la solicitud. Recepción
  // puede ajustarlo si registra el checkout un rato después de que el
  // huésped ya se fue -- también se usa como referencia para el cálculo
  // de late.
  @IsOptional()
  @IsISO8601()
  checkoutReal?: string;
}
