import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearTurnoDto } from './dto/crear-turno.dto';
import { ActualizarTurnoDto } from './dto/actualizar-turno.dto';

@Injectable()
export class TurnosService {
  async crear(client: SupabaseClient, hotelId: string, dto: CrearTurnoDto) {
    const { data, error } = await client
      .from('turnos')
      .insert({
        hotel_id: hotelId,
        nombre: dto.nombre,
        hora_inicio: dto.horaInicio,
        hora_fin: dto.horaFin,
        activo: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listar(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('turnos')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('hora_inicio', { ascending: true });
    if (error) throw error;
    return data;
  }

  async actualizar(client: SupabaseClient, hotelId: string, id: string, dto: ActualizarTurnoDto) {
    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.horaInicio !== undefined) cambios.hora_inicio = dto.horaInicio;
    if (dto.horaFin !== undefined) cambios.hora_fin = dto.horaFin;
    if (dto.activo !== undefined) cambios.activo = dto.activo;

    const { data, error } = await client
      .from('turnos')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Turno no encontrado en este hotel');
    return data;
  }
}
