import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearNotaDto } from './dto/crear-nota.dto';
import { ActualizarNotaDto } from './dto/actualizar-nota.dto';
import { ListarNotasQueryDto } from './dto/listar-notas-query.dto';

// Perú (America/Lima) es UTC-5 todo el año -- mismo criterio que en
// reportes.service.ts/reservas.service.ts para no comparar contra
// medianoche UTC por error.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function desdeRelojLima(relojLima: Date): Date {
  return new Date(relojLima.getTime() + PERU_UTC_OFFSET_MS);
}

// Convierte una fecha 'YYYY-MM-DD' (hora Lima) al instante UTC real de esa
// medianoche en Lima.
function fechaLimaAInstante(fechaYMD: string): Date {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const relojLima = new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0));
  return desdeRelojLima(relojLima);
}

function sumarDiasYMD(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// El <input type="datetime-local"> del formulario (Notas.tsx) manda
// "YYYY-MM-DDTHH:mm" en hora del navegador, SIN zona -- si eso se guarda
// tal cual en una columna timestamptz, Postgres lo interpreta con el
// timezone de sesión de Supabase (UTC), no con la hora Lima que realmente
// escribió el recepcionista, y la nota terminaba mostrándose ~5 horas
// corrida (ej. "8:45 p.m." guardado aparecía como "3:45 p.m."). Perú es
// UTC-5 fijo todo el año, así que alcanza con declararlo explícito.
function aInstanteLima(fechaHoraLocal: string | undefined): string | undefined {
  if (!fechaHoraLocal) return fechaHoraLocal;
  // Ya viene con zona (termina en 'Z' o en un offset tipo '+05:00') -- no tocar.
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(fechaHoraLocal)) return fechaHoraLocal;
  const conSegundos = fechaHoraLocal.length === 16 ? `${fechaHoraLocal}:00` : fechaHoraLocal;
  return `${conSegundos}-05:00`;
}

const NOTA_SELECT = `
  id,
  fecha_hora,
  descripcion,
  tipo,
  dirigido_a,
  usuario_escribio:personal(id, nombre),
  fecha_hora_inicio_repeticion,
  fecha_hora_fin_repeticion,
  periodicidad_minutos,
  fecha_hora_envio,
  celular_destino,
  adjuntos,
  telefonos_adicionales
`;

@Injectable()
export class NotasService {
  /**
   * Obtiene las notas de un hotel, ordenadas de más reciente a más antigua
   * (fecha_hora, la de creación). desde/hasta filtran por día calendario en
   * hora Lima; por defecto el frontend manda las de hoy.
   */
  async listar(client: SupabaseClient, hotelId: string, filtros: ListarNotasQueryDto) {
    let query = client.from('notas').select(NOTA_SELECT).eq('hotel_id', hotelId);

    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
    if (filtros.desde) query = query.gte('fecha_hora', fechaLimaAInstante(filtros.desde).toISOString());
    // Límite superior exclusivo (medianoche del día siguiente) -- evita
    // líos de redondeo con "23:59:59.999" y sigue siendo el mismo instante
    // real que "hasta las 23:59:59 hora Lima de ese día".
    if (filtros.hasta) {
      query = query.lt('fecha_hora', fechaLimaAInstante(sumarDiasYMD(filtros.hasta, 1)).toISOString());
    }

    const { data: notas, error } = await query.order('fecha_hora', { ascending: false });
    if (error) throw error;
    return notas;
  }

  /**
   * Crea una nueva nota
   */
  async crear(
    client: SupabaseClient,
    hotelId: string,
    dto: CrearNotaDto,
    usuarioId: string
  ) {
    const { data: nota, error } = await client
      .from('notas')
      .insert({
        hotel_id: hotelId,
        descripcion: dto.descripcion,
        tipo: dto.tipo,
        dirigido_a: dto.dirigido_a,
        usuario_escribio: usuarioId,
        fecha_hora_inicio_repeticion: aInstanteLima(dto.fecha_hora_inicio_repeticion),
        fecha_hora_fin_repeticion: aInstanteLima(dto.fecha_hora_fin_repeticion),
        periodicidad_minutos: dto.periodicidad_minutos ?? null,
        celular_destino: dto.celular_destino,
        adjuntos: dto.adjuntos,
        telefonos_adicionales: dto.telefonos_adicionales,
      })
      .select()
      .single();

    if (error) throw error;
    return nota;
  }

  /**
   * Edita una nota existente. El formulario del frontend siempre manda el
   * objeto completo (mismos campos que crear), así que acá se actualiza
   * cualquier campo que venga -- no es un PATCH parcial de verdad, pero se
   * escribe igual de defensivo (solo toca lo que llegó) por si algún otro
   * caller manda menos.
   */
  async actualizar(client: SupabaseClient, hotelId: string, id: string, dto: ActualizarNotaDto) {
    const cambios: Record<string, unknown> = {};
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion;
    if (dto.tipo !== undefined) cambios.tipo = dto.tipo;
    if (dto.dirigido_a !== undefined) cambios.dirigido_a = dto.dirigido_a;
    if (dto.fecha_hora_inicio_repeticion !== undefined) {
      cambios.fecha_hora_inicio_repeticion = aInstanteLima(dto.fecha_hora_inicio_repeticion);
    }
    if (dto.fecha_hora_fin_repeticion !== undefined) {
      cambios.fecha_hora_fin_repeticion = aInstanteLima(dto.fecha_hora_fin_repeticion);
    }
    if (dto.periodicidad_minutos !== undefined) cambios.periodicidad_minutos = dto.periodicidad_minutos;
    if (dto.celular_destino !== undefined) cambios.celular_destino = dto.celular_destino;
    if (dto.adjuntos !== undefined) cambios.adjuntos = dto.adjuntos;
    if (dto.telefonos_adicionales !== undefined) cambios.telefonos_adicionales = dto.telefonos_adicionales;

    const { data: nota, error } = await client
      .from('notas')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select(NOTA_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!nota) throw new NotFoundException('Nota no encontrada en este hotel');
    return nota;
  }
}
