import { IsDateString, IsInt, Matches, Min } from 'class-validator';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DisponibilidadCotizacionDto {
  // YYYY-MM-DD, fecha probable de check-in.
  @IsDateString()
  fechaCheckin: string;

  // HH:MM
  @Matches(HORA_REGEX, { message: 'horaCheckin debe tener formato HH:MM' })
  horaCheckin: string;

  @IsInt()
  @Min(1)
  noches: number;

  // HH:MM
  @Matches(HORA_REGEX, { message: 'horaCheckout debe tener formato HH:MM' })
  horaCheckout: string;
}
