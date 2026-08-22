import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Body opcional del checkout. El cargo por late ya no se calcula ni se
 * cobra solo aquí -- recepción lo agrega a mano ("Registrar movimiento",
 * tipo 'late') cuando decide cobrarlo, caso por caso.
 */
export class CheckoutDto {
  // Si no viene, se usa el momento en que llega la solicitud. Recepción
  // puede ajustarlo si registra el checkout un rato después de que el
  // huésped ya se fue.
  @IsOptional()
  @IsISO8601()
  checkoutReal?: string;
}
