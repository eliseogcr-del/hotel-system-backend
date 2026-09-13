import { IsDateString, Matches } from 'class-validator';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EditarFechasCotizacionDto {
  @IsDateString()
  fechaDesde: string;

  @IsDateString()
  fechaHasta: string;

  @Matches(HORA_REGEX, { message: 'horaCheckin debe tener formato HH:MM' })
  horaCheckin: string;

  @Matches(HORA_REGEX, { message: 'horaCheckout debe tener formato HH:MM' })
  horaCheckout: string;
}
