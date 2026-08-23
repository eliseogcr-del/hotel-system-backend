import {
  Controller,
  ForbiddenException,
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
 */
@Controller('webhooks/booking-inbox')
export class BookingInboxController {
  constructor(
    private readonly bookingInboxService: BookingInboxService,
    private readonly config: ConfigService,
  ) {}

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
