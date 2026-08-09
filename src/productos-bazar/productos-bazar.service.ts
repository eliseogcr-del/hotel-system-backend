import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearProductoBazarDto } from './dto/crear-producto-bazar.dto';
import { ActualizarProductoBazarDto } from './dto/actualizar-producto-bazar.dto';

@Injectable()
export class ProductosBazarService {
  async crear(client: SupabaseClient, hotelId: string, dto: CrearProductoBazarDto) {
    const { data, error } = await client
      .from('productos_bazar')
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
      .from('productos_bazar')
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
    dto: ActualizarProductoBazarDto,
  ) {
    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.precio !== undefined) cambios.precio = dto.precio;
    if (dto.activo !== undefined) cambios.activo = dto.activo;

    const { data, error } = await client
      .from('productos_bazar')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Producto de bazar no encontrado en este hotel');
    return data;
  }
}
