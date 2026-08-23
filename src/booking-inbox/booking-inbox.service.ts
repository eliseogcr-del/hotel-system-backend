import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { SupabaseService } from '../common/supabase/supabase.service';
import { ParserBookingInboxService } from './parser-booking-inbox.service';
import { WhatsappCallmebotService } from './whatsapp-callmebot.service';

const REMITENTE_BOOKING = 'noreply@booking.com';

export interface CorreoProcesado {
  asunto: string;
  tipo: string;
  resId: string | null;
  mensajeWhatsapp: string | null;
  whatsappEnviado: boolean | null; // null en dry run (no se intenta enviar)
  whatsappError: string | null;
}

/**
 * Revisa por IMAP la bandeja de correo del hotel buscando avisos de Booking
 * sin leer, arma el aviso de WhatsApp correspondiente y marca el correo
 * como leído para no volver a procesarlo (misma idea que "unread = pendiente
 * de procesar", sin necesitar una tabla aparte para no duplicar avisos).
 *
 * Deliberadamente NO crea ninguna reserva: los correos de Booking de este
 * hotel nunca traen tipo de habitación, y a veces ni fechas/huésped -- ver
 * ParserBookingInboxService. Solo avisa; la reserva la arma el recepcionista
 * a mano con los datos reales del extranet de Booking.
 */
@Injectable()
export class BookingInboxService {
  private readonly logger = new Logger(BookingInboxService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly parser: ParserBookingInboxService,
    private readonly whatsapp: WhatsappCallmebotService,
  ) {}

  async revisarBandeja(dryRun: boolean): Promise<{ procesados: CorreoProcesado[]; total: number }> {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: this.config.getOrThrow<string>('BOOKING_GMAIL_USER'),
        pass: this.config.getOrThrow<string>('BOOKING_GMAIL_APP_PASSWORD'),
      },
      logger: false,
    });

    const procesados: CorreoProcesado[] = [];

    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search(
          { seen: false, from: REMITENTE_BOOKING },
          { uid: true },
        );

        for (const uid of uids || []) {
          const msg = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const asunto = parsed.subject ?? '';
          const texto = parsed.text ?? '';
          const messageId = parsed.messageId ?? null;

          const resultado = this.parser.parsear(asunto, texto);

          if (resultado.tipo === 'desconocido') {
            // No se toca -- se deja sin leer para no perder de vista que
            // hay un correo de Booking de un tipo que todavía no se
            // reconoce, por si vale la pena calibrar el parser con él.
            continue;
          }

          // Gmail puede tardar unos segundos en reflejar en SEARCH un
          // \Seen que ya se guardó de verdad (índice con retraso, ver
          // conversación) -- si el ciclo anterior ya avisó este mismo
          // correo (mismo Message-ID) antes de que el índice se pusiera al
          // día, no se reenvía el WhatsApp de nuevo.
          if (!dryRun && messageId && (await this.yaFueAvisado(messageId))) {
            await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'], { uid: true });
            continue;
          }

          const mensaje = this.armarMensajeWhatsapp(resultado);
          let whatsappEnviado: boolean | null = null;
          let whatsappError: string | null = null;

          if (!dryRun) {
            const envio = await this.whatsapp.enviar(mensaje);
            whatsappEnviado = envio.ok;
            whatsappError = envio.error ?? null;
            // Solo se marca leído y se registra en la base si el aviso
            // realmente salió -- si CallMeBot falla (sin configurar,
            // caído, rate-limit), el correo se queda sin leer para que la
            // próxima revisión lo reintente, en vez de perder el aviso
            // para siempre o llenar la tabla de reintentos repetidos.
            if (whatsappEnviado) {
              await this.registrarImportacion(
                asunto,
                texto,
                resultado,
                messageId,
                this.construirEnlaceBooking(resultado.resId),
                whatsappEnviado,
                whatsappError,
              );
              await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'], { uid: true });
            } else {
              this.logger.warn(`Aviso de WhatsApp no enviado para "${asunto}": ${whatsappError}`);
            }
          }

          procesados.push({
            asunto,
            tipo: resultado.tipo,
            resId: resultado.resId,
            mensajeWhatsapp: mensaje,
            whatsappEnviado,
            whatsappError,
          });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    return { procesados, total: procesados.length };
  }

  private construirEnlaceBooking(resId: string | null): string {
    if (!resId) return 'https://admin.booking.com';
    const hotelIdExterno = this.config.get<string>('BOOKING_HOTEL_ID_EXTERNO', '');
    return `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/booking.html?res_id=${resId}&hotel_id=${hotelIdExterno}&lang=es`;
  }

  private armarMensajeWhatsapp(resultado: ReturnType<ParserBookingInboxService['parsear']>): string {
    const enlace = this.construirEnlaceBooking(resultado.resId);

    if (resultado.tipo === 'peticion_confirmada' && resultado.datos) {
      const d = resultado.datos;
      const lineas = [
        '🔔 Reserva de Booking con datos',
        `Huésped: ${d.nombreHuesped}`,
        d.checkin ? `Check-in: ${d.checkin}` : null,
        d.checkout ? `Check-out: ${d.checkout}` : null,
        d.totalPersonas != null ? `Personas: ${d.totalPersonas}` : null,
        d.totalHabitaciones != null ? `Habitaciones: ${d.totalHabitaciones}` : null,
        resultado.resId ? `N° confirmación: ${resultado.resId}` : null,
        `Revisa y crea la reserva: ${enlace}`,
      ].filter(Boolean);
      return lineas.join('\n');
    }

    if (resultado.tipo === 'reserva_cancelada') {
      const lineas = [
        '❌ Reserva de Booking cancelada',
        resultado.resId ? `N° confirmación: ${resultado.resId}` : 'Sin número de confirmación detectado',
        resultado.datosCancelacion?.gastoCancelacion
          ? `Gasto de cancelación: ${resultado.datosCancelacion.gastoCancelacion}`
          : null,
        `Revisa el detalle: ${enlace}`,
      ].filter(Boolean);
      return lineas.join('\n');
    }

    return [
      '🔔 Nueva reserva de Booking.com',
      resultado.resId ? `N° confirmación: ${resultado.resId}` : 'Sin número de confirmación detectado',
      'El correo no trae más datos (huésped/fechas) -- revísala en Booking:',
      enlace,
    ].join('\n');
  }

  private async yaFueAvisado(messageId: string): Promise<boolean> {
    const service = this.supabase.getServiceClient();
    const { data, error } = await service
      .from('importaciones_canal')
      .select('id')
      .eq('canal', 'booking')
      .eq('datos_crudos->>messageId', messageId)
      .limit(1)
      .maybeSingle();
    if (error) {
      this.logger.error(`No se pudo verificar si el correo ya fue avisado: ${error.message}`);
      return false;
    }
    return !!data;
  }

  private async registrarImportacion(
    asunto: string,
    cuerpo: string,
    resultado: ReturnType<ParserBookingInboxService['parsear']>,
    messageId: string | null,
    enlaceBooking: string,
    whatsappEnviado: boolean | null,
    whatsappError: string | null,
  ) {
    const hotelId = this.config.get<string>('BOOKING_GMAIL_HOTEL_ID');
    if (!hotelId) {
      this.logger.warn('BOOKING_GMAIL_HOTEL_ID no configurado -- no se guarda el registro en importaciones_canal');
      return;
    }
    const service = this.supabase.getServiceClient();
    const { error } = await service.from('importaciones_canal').insert({
      hotel_id: hotelId,
      canal: 'booking',
      correo_origen: asunto,
      // No es un error de verdad -- este módulo nunca crea la reserva sola
      // (ver comentario de la clase), 'error' es el único valor del check
      // constraint que no implica "reserva creada", así que se reusa para
      // todo lo que solo generó un aviso. El detalle real de qué pasó vive
      // en error_detalle/datos_crudos.tipo, no en este estado.
      estado_parseo: 'error',
      error_detalle:
        resultado.tipo === 'peticion_confirmada'
          ? 'Correo con datos parciales (sin tipo de habitación) -- solo se envió aviso de WhatsApp, no se creó reserva'
          : resultado.tipo === 'reserva_cancelada'
            ? 'Aviso de cancelación -- solo se envió WhatsApp, no se modificó ninguna reserva'
            : 'Correo de aviso sin datos de reserva -- solo se envió aviso de WhatsApp con enlace al extranet',
      reserva_id: null,
      datos_crudos: {
        tipo: resultado.tipo,
        resId: resultado.resId,
        messageId,
        enlaceBooking,
        datosParseados: resultado.datos,
        datosCancelacion: resultado.datosCancelacion,
        whatsappEnviado,
        whatsappError,
        cuerpo,
      },
    });
    if (error) this.logger.error(`No se pudo guardar la importación en la base: ${error.message}`);
  }
}
