import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearTipoDesayunoDto } from './dto/crear-tipo-desayuno.dto';
import { ActualizarTipoDesayunoDto } from './dto/actualizar-tipo-desayuno.dto';

@Injectable()
export class TiposDesayunoService {
  async crear(client: SupabaseClient, hotelId: string, dto: CrearTipoDesayunoDto) {
    const { data, error } = await client
      .from('tipos_desayuno')
      .insert({
        hotel_id: hotelId,
        nombre: dto.nombre,
        precio: dto.precio,
        activo: true,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listar(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('tipos_desayuno')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data;
  }

  async actualizar(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    dto: ActualizarTipoDesayunoDto,
  ) {
    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.precio !== undefined) cambios.precio = dto.precio;
    if (dto.activo !== undefined) cambios.activo = dto.activo;

    const { data, error } = await client
      .from('tipos_desayuno')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Tipo de desayuno no encontrado en este hotel');
    return data;
  }
}
