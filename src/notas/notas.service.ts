import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearNotaDto } from './dto/crear-nota.dto';

@Injectable()
export class NotasService {
  /**
   * Obtiene todas las notas de un hotel
   */
  async listar(client: SupabaseClient, hotelId: string) {
    const { data: notas, error } = await client
      .from('notas')
      .select(`
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
      `)
      .eq('hotel_id', hotelId)
      .order('fecha_hora', { ascending: false });

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
        fecha_hora_inicio_repeticion: dto.fecha_hora_inicio_repeticion,
        fecha_hora_fin_repeticion: dto.fecha_hora_fin_repeticion,
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
}