import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Protege rutas servidor-a-servidor (sin usuario logueado detrás -- por eso
 * no es AuthGuard/JWT de Supabase) con un secreto compartido en una
 * cabecera, mismo patrón que BookingInboxController (BOOKING_WEBHOOK_SECRET).
 * Pensado para integraciones externas (ej. un asistente de IA en otra
 * plataforma) que sí pueden guardar un secreto con seguridad -- a
 * diferencia del formulario público /cotizar/:hotelId, que corre en el
 * navegador del cliente final y por eso NO lleva este guard.
 *
 * Fallo cerrado: si WHATSAPP_PUBLIC_API_KEY no está configurada, deniega
 * siempre (nunca "sin clave configurada = abierto a cualquiera").
 */
@Injectable()
export class WhatsappApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const esperada = this.config.get<string>('WHATSAPP_PUBLIC_API_KEY');
    if (!esperada) {
      throw new UnauthorizedException('Acceso no disponible');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const recibida = request.headers['x-whatsapp-api-key'];

    if (typeof recibida !== 'string' || !this.coincide(recibida, esperada)) {
      throw new UnauthorizedException('Clave inválida');
    }
    return true;
  }

  // timingSafeEqual exige buffers del mismo largo -- comparar longitudes
  // antes es inevitable para no reventar, y en sí mismo no revela nada útil
  // sobre el contenido real de la clave (ambas rutas igual tardan
  // básicamente lo mismo comparado con el costo de red de la petición).
  private coincide(recibida: string, esperada: string): boolean {
    const bufRecibida = Buffer.from(recibida);
    const bufEsperada = Buffer.from(esperada);
    if (bufRecibida.length !== bufEsperada.length) return false;
    return timingSafeEqual(bufRecibida, bufEsperada);
  }
}
