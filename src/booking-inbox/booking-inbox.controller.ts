import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingInboxService } from './booking-inbox.service';

/**
 * Lo llama un cron externo (cron-job.org, gratis) cada pocos minutos -- no
 * hay un usuario logueado en ese momento, así que no usa AuthGuard/RolesGuard
 * como el resto de la API; se protege con un secreto compartido simple
 * (BOOKING_WEBHOOK_SECRET) en vez de un JWT de Supabase.
 *
 * Acepta GET además de POST a propósito: el plan gratis de cron-job.org
 * arma la URL en un formulario simple y esconde método/cabeceras
 * personalizadas detrás de una pestaña "Avanzado" -- con GET + el secreto
 * como query param, la URL sola alcanza, sin tener que configurar nada más.
 */
@Controller('webhooks/booking-inbox')
export class BookingInboxController {
  constructor(
    private readonly bookingInboxService: BookingInboxService,
    private readonly config: ConfigService,
  ) {}

  @Get('revisar')
  @Post('revisar')
  async revisar(
    @Query('secret') secretQuery: string | undefined,
    @Headers('x-webhook-secret') secretHeader: string | undefined,
    @Query('dryRun') dryRun: string | undefined,
  ) {
    const secretEsperado = this.config.getOrThrow<string>('BOOKING_WEBHOOK_SECRET');
    const secretRecibido = secretHeader ?? secretQuery;
    if (secretRecibido !== secretEsperado) {
      throw new ForbiddenException('Secreto inválido');
    }

    return this.bookingInboxService.revisarBandeja(dryRun === 'true');
  }
}
