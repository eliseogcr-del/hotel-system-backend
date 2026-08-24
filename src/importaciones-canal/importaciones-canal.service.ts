import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { ParserCanalService, DatosParseados } from './parser/parser-canal.service';
import { ProcesarCorreoDto } from './dto/procesar-correo.dto';
import { ListarImportacionesQueryDto } from './dto/listar-importaciones-query.dto';

/**
 * Opción B de integración (CLAUDE.md 3.6): en vez de conectar directo a la
 * API de Booking (solo disponible para channel managers, no para hoteles
 * individuales), se procesa el texto del correo de confirmación que ya
 * llega por email. El envío del correo a este endpoint (vía un forward
 * manual o un futuro webhook de recepción de correo) queda fuera de este
 * módulo: aquí solo se resuelve el parseo + la creación de la reserva.
 *
 * Diseño deliberadamente conservador: si el parseo encuentra huésped +
 * fechas + código de reserva, crea una reserva 'pendiente_revision' SIN
 * habitación asignada todavía (el texto libre del correo no permite mapear
 * de forma confiable a una habitación física concreta) — el recepcionista
 * la completa y confirma desde ReservasModule. Así se ahorra re-tipear los
 * datos del huésped aunque la asignación de habitación siga siendo manual.
 */
@Injectable()
export class ImportacionesCanalService {
  constructor(private readonly parser: ParserCanalService) {}

  async procesarCorreo(
    client: SupabaseClient,
    hotelId: string,
    dto: ProcesarCorreoDto,
    personalId: string,
  ) {
    const resultado = this.parser.parsear(dto.canal, dto.cuerpoCorreo);

    if (!resultado.ok) {
      return this.insertarImportacion(client, hotelId, dto, {
        estado_parseo: 'error',
        error_detalle: `No se pudieron extraer estos campos del correo: ${resultado.camposFaltantes!.join(', ')}`,
        reserva_id: null,
      });
    }

    const datos = resultado.datos!;

    // Idempotencia: si este mismo código de reserva del canal ya se
    // procesó antes, reutilizamos esa reserva en vez de duplicarla (un
    // correo puede reenviarse o reprocesarse más de una vez).
    const { data: existente, error: existenteError } = await client
      .from('reservas')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('origen', dto.canal)
      .eq('codigo_externo', datos.codigoExterno)
      .maybeSingle();
    if (existenteError) throw existenteError;

    if (existente) {
      return this.insertarImportacion(client, hotelId, dto, {
        estado_parseo: 'ok',
        error_detalle: null,
        reserva_id: existente.id,
        datosParseados: datos,
      });
    }

    const huespedId = await this.obtenerOCrearHuesped(client, hotelId, dto.canal, datos);

    const dias = Math.max(
      1,
      Math.ceil(
        (new Date(datos.checkout).getTime() - new Date(datos.checkin).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    const { data: reserva, error: reservaError } = await client
      .from('reservas')
      .insert({
        hotel_id: hotelId,
        huesped_id: huespedId,
        origen: dto.canal,
        codigo_externo: datos.codigoExterno,
        fecha_ingreso: `${datos.checkin}T15:00:00`,
        dias_hospedaje: dias,
        fecha_salida_prog: datos.checkout,
        moneda: 'PEN',
        estado: 'pendiente_revision',
        creado_por: personalId,
      })
      .select('id')
      .single();
    if (reservaError) throw reservaError;

    return this.insertarImportacion(client, hotelId, dto, {
      estado_parseo: 'ok',
      error_detalle: null,
      reserva_id: reserva.id,
      datosParseados: datos,
    });
  }

  async reprocesar(client: SupabaseClient, hotelId: string, id: string, personalId: string) {
    const importacion = await this.obtenerDetalle(client, hotelId, id);
    const crudo = importacion.datos_crudos as { correoOrigen?: string; cuerpo?: string } | null;

    if (!crudo?.cuerpo) {
      throw new NotFoundException('Esta importación no tiene el correo crudo guardado para reprocesar');
    }

    return this.procesarCorreo(
      client,
      hotelId,
      { canal: importacion.canal, correoOrigen: crudo.correoOrigen, cuerpoCorreo: crudo.cuerpo },
      personalId,
    );
  }

  async listar(client: SupabaseClient, hotelId: string, filtros: ListarImportacionesQueryDto) {
    let query = client
      .from('importaciones_canal')
      .select('id, canal, correo_origen, fecha_recibido, estado_parseo, reserva_id, error_detalle, datos_crudos')
      .eq('hotel_id', hotelId)
      .order('fecha_recibido', { ascending: false });

    if (filtros.canal) query = query.eq('canal', filtros.canal);
    if (filtros.estadoParseo) query = query.eq('estado_parseo', filtros.estadoParseo);
    if (filtros.desde) {
      query = query.gte('fecha_recibido', this.fechaLimaAInstante(filtros.desde).toISOString());
    }
    if (filtros.hasta) {
      const hastaExclusivo = new Date(
        this.fechaLimaAInstante(filtros.hasta).getTime() + 24 * 60 * 60 * 1000,
      );
      query = query.lt('fecha_recibido', hastaExclusivo.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  // Convierte una fecha 'YYYY-MM-DD' (elegida en un <input type="date">, que
  // el recepcionista piensa en hora Lima) al instante UTC real de esa
  // medianoche en Lima -- mismo criterio que EstadiasService.
  private fechaLimaAInstante(fechaYMD: string): Date {
    const [anio, mes, dia] = fechaYMD.split('-').map(Number);
    const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
    const relojLima = new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0));
    return new Date(relojLima.getTime() + PERU_UTC_OFFSET_MS);
  }

  async obtenerDetalle(client: SupabaseClient, hotelId: string, id: string) {
    const { data, error } = await client
      .from('importaciones_canal')
      .select('*')
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Importación no encontrada en este hotel');
    return data;
  }

  private async obtenerOCrearHuesped(
    client: SupabaseClient,
    hotelId: string,
    canal: 'booking' | 'airbnb',
    datos: DatosParseados,
  ): Promise<string> {
    const nroDoc = `${canal}-${datos.codigoExterno}`;

    const { data: existente, error: existenteError } = await client
      .from('huespedes')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('tipo_doc', 'otro')
      .eq('nro_doc', nroDoc)
      .maybeSingle();
    if (existenteError) throw existenteError;
    if (existente) return existente.id;

    const partes = datos.nombreHuesped.trim().split(/\s+/);
    const nombres = partes.slice(0, Math.max(1, partes.length - 1)).join(' ') || datos.nombreHuesped;
    const apellidos = partes.length > 1 ? partes[partes.length - 1] : 'N/D';

    const { data: creado, error: crearError } = await client
      .from('huespedes')
      .insert({
        hotel_id: hotelId,
        tipo_doc: 'otro',
        nro_doc: nroDoc,
        nombres,
        apellidos,
      })
      .select('id')
      .single();
    if (crearError) throw crearError;
    return creado.id;
  }

  private async insertarImportacion(
    client: SupabaseClient,
    hotelId: string,
    dto: ProcesarCorreoDto,
    resultado: {
      estado_parseo: 'ok' | 'error';
      error_detalle: string | null;
      reserva_id: string | null;
      datosParseados?: DatosParseados;
    },
  ) {
    const { data, error } = await client
      .from('importaciones_canal')
      .insert({
        hotel_id: hotelId,
        canal: dto.canal,
        correo_origen: dto.correoOrigen ?? null,
        estado_parseo: resultado.estado_parseo,
        error_detalle: resultado.error_detalle,
        reserva_id: resultado.reserva_id,
        datos_crudos: {
          correoOrigen: dto.correoOrigen ?? null,
          cuerpo: dto.cuerpoCorreo,
          parseado: resultado.datosParseados ?? null,
        },
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
