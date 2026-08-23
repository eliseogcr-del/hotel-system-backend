import { Injectable } from '@nestjs/common';

export type TipoCorreoBooking = 'nueva_reserva' | 'peticion_confirmada' | 'desconocido';

export interface DatosPeticionConfirmada {
  nombreHuesped: string;
  checkin: string | null; // YYYY-MM-DD si se pudo interpretar la fecha
  checkout: string | null;
  totalPersonas: number | null;
  totalHabitaciones: number | null;
}

export interface CorreoBookingParseado {
  tipo: TipoCorreoBooking;
  resId: string | null;
  datos: DatosPeticionConfirmada | null;
}

const MESES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
};

/**
 * Calibrado contra correos REALES de Booking.com de este hotel (no una
 * suposición del formato -- ver conversación donde el usuario los pasó).
 * Booking manda al menos 3 tipos de correo distintos:
 *  - "Nueva reserva de última hora (...)" / "¡Nueva reserva! (...)": solo
 *    avisan que llegó una reserva, con el número de confirmación y un
 *    enlace al extranet -- NUNCA traen huésped/fechas/tipo de habitación
 *    (Booking los oculta del correo por seguridad).
 *  - "La petición de {nombre} se ha confirmado": solo llega si el huésped
 *    pidió algo (ej. hora de check-in) y Booking lo autoconfirmó, pero
 *    cuando llega SÍ trae un bloque "Datos de la reserva" con nombre,
 *    check-in, check-out y totales de personas/habitaciones (el tipo de
 *    habitación tampoco viene acá).
 * Cualquier otro asunto de Booking (cancelación, modificación, mensaje del
 * huésped, etc.) se clasifica 'desconocido' y se ignora a propósito -- no
 * hay muestra real de esos todavía, mejor no arriesgar falsos avisos.
 */
@Injectable()
export class ParserBookingInboxService {
  parsear(asunto: string, texto: string): CorreoBookingParseado {
    if (/petici[oó]n.*se ha confirmado/i.test(asunto)) {
      return {
        tipo: 'peticion_confirmada',
        resId: this.buscarResId(texto),
        datos: this.parsearPeticionConfirmada(texto),
      };
    }
    if (/nueva reserva/i.test(asunto)) {
      return {
        tipo: 'nueva_reserva',
        resId: this.buscarResId(texto),
        datos: null,
      };
    }
    return { tipo: 'desconocido', resId: this.buscarResId(texto), datos: null };
  }

  private buscarResId(texto: string): string | null {
    const porUrl = texto.match(/res_id=(\d+)/i);
    if (porUrl) return porUrl[1];
    const porConfirmacion = texto.match(
      /(?:booking confirmation|n[uú]mero de confirmaci[oó]n|n[uú]mero de reserva)\s*[—\-:]*\s*\n?\s*(\d{6,})/i,
    );
    if (porConfirmacion) return porConfirmacion[1];
    return null;
  }

  // El bloque "Datos de la reserva" trae cada etiqueta en su propia línea
  // y el valor en la línea siguiente (no "Etiqueta: valor" en una sola
  // línea como asumía el parser viejo -- por eso este es uno nuevo, no una
  // extensión de ParserCanalService).
  private parsearPeticionConfirmada(texto: string): DatosPeticionConfirmada | null {
    const nombreHuesped = this.buscarValorEnLineaSiguiente(texto, /Nombre del cliente:/i);
    if (!nombreHuesped) return null;

    return {
      nombreHuesped,
      checkin: this.normalizarFecha(this.buscarValorEnLineaSiguiente(texto, /Check-in:/i)),
      checkout: this.normalizarFecha(this.buscarValorEnLineaSiguiente(texto, /Check-out:/i)),
      totalPersonas: this.aNumero(this.buscarValorEnLineaSiguiente(texto, /Total de personas:/i)),
      totalHabitaciones: this.aNumero(this.buscarValorEnLineaSiguiente(texto, /Total de habitaciones:/i)),
    };
  }

  private buscarValorEnLineaSiguiente(texto: string, etiqueta: RegExp): string | null {
    const lineas = texto.split('\n').map((l) => l.trim());
    const idx = lineas.findIndex((l) => etiqueta.test(l));
    if (idx === -1) return null;
    for (let i = idx + 1; i < lineas.length; i++) {
      if (lineas[i]) return lineas[i];
    }
    return null;
  }

  private aNumero(valor: string | null): number | null {
    if (!valor) return null;
    const m = valor.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  // "dom, 23 ago 2026" -> "2026-08-23"
  private normalizarFecha(crudo: string | null): string | null {
    if (!crudo) return null;
    const m = crudo.match(/(\d{1,2})\s+([a-zA-ZÀ-ÿ]{3,})\.?\s+(\d{4})/);
    if (!m) return null;
    const dia = m[1].padStart(2, '0');
    const mesTexto = m[2].toLowerCase().slice(0, 3);
    const mes = MESES[mesTexto];
    if (!mes) return null;
    return `${m[3]}-${mes}-${dia}`;
  }
}
