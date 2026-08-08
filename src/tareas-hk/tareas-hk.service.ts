import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearTareaHkDto } from './dto/crear-tarea-hk.dto';
import { AsignarTareaHkDto } from './dto/asignar-tarea-hk.dto';
import { ListarTareasHkQueryDto } from './dto/listar-tareas-hk-query.dto';

interface TareaHk {
  id: string;
  hotel_id: string;
  habitacion_id: string;
  tipo: 'limpieza' | 'mantenimiento';
  estado: 'planificado' | 'en_proceso' | 'terminado';
  con_huesped_dentro: boolean;
  asignado_a: string | null;
}

@Injectable()
export class TareasHkService {
  async crear(
    client: SupabaseClient,
    hotelId: string,
    dto: CrearTareaHkDto,
    personalId: string,
  ) {
    const { data: hab, error: habError } = await client
      .from('habitaciones')
      .select('id')
      .eq('id', dto.habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (habError) throw habError;
    if (!hab) throw new NotFoundException('La habitación no existe en este hotel');

    const { data, error } = await client
      .from('tareas_hk')
      .insert({
        hotel_id: hotelId,
        habitacion_id: dto.habitacionId,
        tipo: dto.tipo,
        prioridad: dto.prioridad ?? 100,
        con_huesped_dentro: dto.conHuespedDentro ?? false,
        asignado_a: dto.asignadoA ?? null,
        definido_por: personalId,
        estado: 'planificado',
      })
      .select('*, habitaciones(hab_numero, piso)')
      .single();
    if (error) throw error;
    return data;
  }

  async listar(client: SupabaseClient, hotelId: string, filtros: ListarTareasHkQueryDto) {
    let query = client
      .from('tareas_hk')
      .select('*, habitaciones(hab_numero, piso)')
      .eq('hotel_id', hotelId)
      .order('prioridad', { ascending: true })
      .order('created_at', { ascending: true });

    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
    if (filtros.habitacionId) query = query.eq('habitacion_id', filtros.habitacionId);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async obtenerDetalle(client: SupabaseClient, hotelId: string, tareaId: string) {
    const { data, error } = await client
      .from('tareas_hk')
      .select('*, habitaciones(hab_numero, piso)')
      .eq('id', tareaId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Tarea de HK no encontrada en este hotel');
    return data;
  }

  /**
   * Inicia la tarea (el HK la toma desde su celular). Si nadie la tenía
   * asignada, queda auto-asignada a quien la inicia. Si es 'mantenimiento'
   * SIN huésped dentro, la habitación pasa a ese estado ahora. Con huésped
   * dentro el huésped sigue físicamente en el cuarto, así que la
   * habitación se queda 'ocupada' (rojo) todo el tiempo que dure la
   * tarea -- el frontend usa tareaHkEnProceso para mostrar "en proceso de
   * mantenimiento" sin cambiar el color. Ver CLAUDE.md 3.2.
   */
  async iniciar(client: SupabaseClient, hotelId: string, tareaId: string, personalId: string) {
    const tarea = await this.cargarTareaHotel(client, hotelId, tareaId);
    if (tarea.estado !== 'planificado') {
      throw new BadRequestException(`No se puede iniciar: la tarea está en estado '${tarea.estado}'`);
    }

    const { error: updError } = await client
      .from('tareas_hk')
      .update({
        estado: 'en_proceso',
        iniciado_en: new Date().toISOString(),
        asignado_a: tarea.asignado_a ?? personalId,
      })
      .eq('id', tareaId);
    if (updError) throw updError;

    if (tarea.tipo === 'mantenimiento' && !tarea.con_huesped_dentro) {
      const { error: habError } = await client
        .from('habitaciones')
        .update({ estado: 'mantenimiento' })
        .eq('id', tarea.habitacion_id);
      if (habError) throw habError;
    }

    return this.obtenerDetalle(client, hotelId, tareaId);
  }

  /**
   * Termina la tarea. La habitación queda 'disponible', salvo mantenimiento
   * con huésped dentro: en ese caso vuelve a 'ocupada' (el huésped nunca se
   * fue de la habitación) y se desmarca mantenimiento_planificado (el
   * checkbox que ve recepción en Habitaciones) porque ya se atendió.
   */
  async terminar(client: SupabaseClient, hotelId: string, tareaId: string) {
    const tarea = await this.cargarTareaHotel(client, hotelId, tareaId);
    if (tarea.estado !== 'en_proceso') {
      throw new BadRequestException(`No se puede terminar: la tarea está en estado '${tarea.estado}'`);
    }

    const { error: updError } = await client
      .from('tareas_hk')
      .update({ estado: 'terminado', finalizado_en: new Date().toISOString() })
      .eq('id', tareaId);
    if (updError) throw updError;

    const nuevoEstadoHabitacion =
      tarea.tipo === 'mantenimiento' && tarea.con_huesped_dentro ? 'ocupada' : 'disponible';

    const cambiosHabitacion: Record<string, unknown> = { estado: nuevoEstadoHabitacion };
    if (tarea.tipo === 'mantenimiento') {
      cambiosHabitacion.mantenimiento_planificado = false;
    }

    const { error: habError } = await client
      .from('habitaciones')
      .update(cambiosHabitacion)
      .eq('id', tarea.habitacion_id);
    if (habError) throw habError;

    return this.obtenerDetalle(client, hotelId, tareaId);
  }

  async asignar(client: SupabaseClient, hotelId: string, tareaId: string, dto: AsignarTareaHkDto) {
    await this.cargarTareaHotel(client, hotelId, tareaId);

    const { error } = await client
      .from('tareas_hk')
      .update({ asignado_a: dto.asignadoA })
      .eq('id', tareaId);
    if (error) throw error;

    return this.obtenerDetalle(client, hotelId, tareaId);
  }

  /**
   * Cancela una tarea que todavía no empezó. Si ya está en_proceso o
   * terminado no se puede borrar (el HK ya la tomó o ya la hizo); hay que
   * dejar el registro histórico.
   */
  async eliminar(client: SupabaseClient, hotelId: string, tareaId: string) {
    const tarea = await this.cargarTareaHotel(client, hotelId, tareaId);
    if (tarea.estado !== 'planificado') {
      throw new BadRequestException(
        `No se puede cancelar: la tarea ya está en estado '${tarea.estado}'`,
      );
    }

    const { error } = await client.from('tareas_hk').delete().eq('id', tareaId);
    if (error) throw error;
    return { eliminado: true };
  }

  private async cargarTareaHotel(
    client: SupabaseClient,
    hotelId: string,
    tareaId: string,
  ): Promise<TareaHk> {
    const { data, error } = await client
      .from('tareas_hk')
      .select('id, hotel_id, habitacion_id, tipo, estado, con_huesped_dentro, asignado_a')
      .eq('id', tareaId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Tarea de HK no encontrada en este hotel');
    return data as TareaHk;
  }
}
