import { Injectable } from '@nestjs/common';

export interface DatosParseados {
  nombreHuesped: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  codigoExterno: string;
  nroPersonas: number;
}

export interface ResultadoParseo {
  ok: boolean;
  datos?: DatosParseados;
  camposFaltantes?: string[];
}

const MESES: Record<string, string> = {
  enero: '01', ene: '01', january: '01', jan: '01',
  febrero: '02', feb: '02', february: '02',
  marzo: '03', mar: '03', march: '03',
  abril: '04', abr: '04', april: '04', apr: '04',
  mayo: '05', may: '05',
  junio: '06', jun: '06', june: '06',
  julio: '07', jul: '07', july: '07',
  agosto: '08', ago: '08', august: '08', aug: '08',
  septiembre: '09', setiembre: '09', sep: '09', september: '09',
  octubre: '10', oct: '10', october: '10',
  noviembre: '11', nov: '11', november: '11',
  diciembre: '12', dic: '12', december: '12', dec: '12',
};

/**
 * Parser best-effort por regex de correos de confirmación de Booking/Airbnb
 * (Opción B, ver CLAUDE.md 3.6). No hay muestras reales de correos de este
 * hotel para calibrar los patrones todavía — están escritos para cubrir los
 * formatos más comunes en inglés/español, pero hay que ajustarlos con
 * correos reales apenas se tengan (por eso guardamos el correo crudo en
 * `datos_crudos`: para poder diagnosticar y afinar esto sin perder datos).
 */
@Injectable()
export class ParserCanalService {
  parsear(canal: 'booking' | 'airbnb', texto: string): ResultadoParseo {
    return canal === 'booking' ? this.parsearBooking(texto) : this.parsearAirbnb(texto);
  }

  private parsearBooking(texto: string): ResultadoParseo {
    return this.armarResultado({
      nombreHuesped: this.buscar(texto, [
        /(?:guest name|nombre del hu[eé]sped|booked by|reservado por)\s*[:\-]?\s*([A-Za-zÀ-ÿ' .]+)/i,
      ]),
      checkin: this.buscarFecha(texto, [
        /check[\s-]?in\s*[:\-]?\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/i,
        /check[\s-]?in\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
      ]),
      checkout: this.buscarFecha(texto, [
        /check[\s-]?out\s*[:\-]?\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/i,
        /check[\s-]?out\s*[:\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i,
      ]),
      codigoExterno: this.buscar(texto, [
        /(?:booking number|confirmation number|n[uú]mero de reserva|c[oó]digo de confirmaci[oó]n)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i,
      ]),
      // [ \t]* (no \s*) a propósito: no debe cruzar saltos de línea, o un
      // número de otro campo en la línea anterior (ej. "Booking number:
      // BK998877\nGuest name: ...") podría leerse como si fuera la
      // cantidad de huéspedes.
      nroPersonasTexto: this.buscar(texto, [/([0-9]+)[ \t]*(?:guests?\b|hu[eé]spedes?\b|personas?\b)/i]),
    });
  }

  private parsearAirbnb(texto: string): ResultadoParseo {
    return this.armarResultado({
      nombreHuesped: this.buscar(texto, [
        /(?:guest|hu[eé]sped)\s*[:\-]?\s*([A-Za-zÀ-ÿ' .]+)/i,
        /reservation (?:for|de)\s+([A-Za-zÀ-ÿ' .]+)/i,
      ]),
      checkin: this.buscarFecha(texto, [
        /check[\s-]?in\s*[:\-]?\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/i,
        /lleg(?:a|ada)\s*[:\-]?\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/i,
      ]),
      checkout: this.buscarFecha(texto, [
        /check[\s-]?out\s*[:\-]?\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/i,
        /sal(?:e|ida)\s*[:\-]?\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/i,
      ]),
      codigoExterno: this.buscar(texto, [
        /(?:confirmation code|c[oó]digo de confirmaci[oó]n|reservation code)\s*[:\-]?\s*([A-Za-z0-9]+)/i,
      ]),
      nroPersonasTexto: this.buscar(texto, [/([0-9]+)[ \t]*(?:guests?\b|hu[eé]spedes?\b)/i]),
    });
  }

  private armarResultado(campos: {
    nombreHuesped: string | null;
    checkin: string | null;
    checkout: string | null;
    codigoExterno: string | null;
    nroPersonasTexto: string | null;
  }): ResultadoParseo {
    const faltantes: string[] = [];
    if (!campos.nombreHuesped) faltantes.push('nombreHuesped');
    if (!campos.checkin) faltantes.push('checkin');
    if (!campos.checkout) faltantes.push('checkout');
    if (!campos.codigoExterno) faltantes.push('codigoExterno');

    if (faltantes.length > 0) {
      return { ok: false, camposFaltantes: faltantes };
    }

    return {
      ok: true,
      datos: {
        nombreHuesped: campos.nombreHuesped!.trim(),
        checkin: campos.checkin!,
        checkout: campos.checkout!,
        codigoExterno: campos.codigoExterno!.trim(),
        nroPersonas: campos.nroPersonasTexto ? parseInt(campos.nroPersonasTexto, 10) : 1,
      },
    };
  }

  private buscar(texto: string, patrones: RegExp[]): string | null {
    for (const patron of patrones) {
      const m = texto.match(patron);
      if (m && m[1]) return m[1].trim();
    }
    return null;
  }

  private buscarFecha(texto: string, patrones: RegExp[]): string | null {
    const crudo = this.buscar(texto, patrones);
    return crudo ? this.normalizarFecha(crudo) : null;
  }

  private normalizarFecha(crudo: string): string | null {
    const isoMatch = crudo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return crudo;

    const textMatch = crudo.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})$/);
    if (textMatch) {
      const dia = textMatch[1].padStart(2, '0');
      const mes = MESES[textMatch[2].toLowerCase()];
      const anio = textMatch[3];
      if (mes) return `${anio}-${mes}-${dia}`;
    }
    return null;
  }
}
