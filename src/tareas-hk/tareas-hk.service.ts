import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearTareaHkDto } from './dto/crear-tarea-hk.dto';
import { AsignarTareaHkDto } from './dto/asignar-tarea-hk.dto';
import { ActualizarNotasTareaHkDto } from './dto/actualizar-notas-tarea-hk.dto';
import { ListarTareasHkQueryDto } from './dto/listar-tareas-hk-query.dto';

// Perú (America/Lima) es UTC-5 todo el año -- mismo criterio que en
// estadias.service.ts para no comparar contra medianoche UTC por error.
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

// Instante UTC real de la medianoche de "hoy" en hora Lima -- para comparar
// contra created_at y decidir qué tareas quedaron atrás.
function inicioDeHoyLima(): Date {
  const relojLimaAhora = comoRelojLima(new Date());
  const soloFecha = new Date(
    Date.UTC(relojLimaAhora.getUTCFullYear(), relojLimaAhora.getUTCMonth(), relojLimaAhora.getUTCDate()),
  );
  return desdeRelojLima(soloFecha);
}

function comoRelojLima(fecha: Date): Date {
  return new Date(fecha.getTime() - PERU_UTC_OFFSET_MS);
}

interface TareaHk {
  id: string;
  hotel_id: string;
  habitacion_id: string;
  tipo: 'limpieza' | 'mantenimiento';
  estado: 'planificado' | 'en_proceso' | 'terminado';
  con_huesped_dentro: boolean;
  asignado_a: string | null;
  notas: string | null;
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
    await this.rolloverPlanificadasVencidas(client, hotelId);

    let query = client
      .from('tareas_hk')
      .select('*, habitaciones(hab_numero, piso)')
      .eq('hotel_id', hotelId)
      .order('prioridad', { ascending: true })
      .order('created_at', { ascending: true });

    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
    if (filtros.habitacionId) query = query.eq('habitacion_id', filtros.habitacionId);
    if (filtros.fecha) {
      const desde = fechaLimaAInstante(filtros.fecha);
      const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
      query = query.gte('created_at', desde.toISOString()).lt('created_at', hasta.toISOString());
    }

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
        // Si HK ya había dejado una nota propia (ej. "faltan toallas")
        // antes de arrancar, no se pisa con el mensaje automático -- esa
        // nota es más útil para recepción que "Empezó la limpieza".
        notas: tarea.notas || (tarea.tipo === 'limpieza' ? 'Empezó la limpieza' : null),
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
   * checkbox que ve recepción en Habitaciones) porque ya se atendió. Si
   * había huésped dentro, se agrega una nota a su registro para que
   * recepción vea que se hizo el mantenimiento. tareas_hk.notas se limpia
   * siempre (el mensaje de "en proceso" ya no aplica).
   */
  async terminar(client: SupabaseClient, hotelId: string, tareaId: string) {
    const tarea = await this.cargarTareaHotel(client, hotelId, tareaId);
    if (tarea.estado !== 'en_proceso') {
      throw new BadRequestException(`No se puede terminar: la tarea está en estado '${tarea.estado}'`);
    }

    const { error: updError } = await client
      .from('tareas_hk')
      .update({ estado: 'terminado', finalizado_en: new Date().toISOString(), notas: null })
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

    if (tarea.tipo === 'mantenimiento' && tarea.con_huesped_dentro) {
      await this.agregarNotaMantenimiento(client, tarea.habitacion_id);
    }

    return this.obtenerDetalle(client, hotelId, tareaId);
  }

  /**
   * Agrega "se realizó el mantenimiento" a las notas del huésped activo
   * (reserva_habitacion.observaciones, la misma columna que edita
   * recepción desde Habitaciones) sin borrar lo que ya tenía escrito.
   */
  private async agregarNotaMantenimiento(client: SupabaseClient, habitacionId: string) {
    const { data: rh, error } = await client
      .from('reserva_habitacion')
      .select('id, observaciones, estadias!inner(estado_actual)')
      .eq('habitacion_id', habitacionId)
      .eq('estadias.estado_actual', 'en_curso')
      .maybeSingle();
    if (error) throw error;
    if (!rh) return;

    const notaNueva = 'Se realizó el mantenimiento.';
    const observaciones = rh.observaciones ? `${rh.observaciones} | ${notaNueva}` : notaNueva;

    const { error: updError } = await client
      .from('reserva_habitacion')
      .update({ observaciones })
      .eq('id', rh.id);
    if (updError) throw updError;
  }

  // Nota libre que HK deja sobre la tarea (ej. "faltan toallas") -- se
  // muestra en la columna Notas de Habitaciones mientras la habitación no
  // tiene huésped activo (ver HabitacionesService.listarConEstado()), para
  // que recepción la vea sin tener que entrar a Tareas HK. Se sobreescribe
  // el mensaje automático de iniciar() ("Empezó la limpieza") si HK escribe
  // algo -- mismo criterio simple que ya usa el resto de las notas del
  // sistema (habitaciones/:id/notas, estadias/:id/notas), sin restringir
  // por estado de la tarea.
  async actualizarNotas(
    client: SupabaseClient,
    hotelId: string,
    tareaId: string,
    dto: ActualizarNotasTareaHkDto,
  ) {
    await this.cargarTareaHotel(client, hotelId, tareaId);

    const { error } = await client
      .from('tareas_hk')
      .update({ notas: dto.notas || null })
      .eq('id', tareaId);
    if (error) throw error;

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

  /**
   * Una tarea 'planificado' que quedó pendiente de días anteriores (nadie
   * la inició) no debe perderse en el filtro de fecha del frontend, que
   * por defecto muestra solo las de hoy -- se "arrastra" al día actual
   * (created_at, el mismo campo que usa el filtro de fecha) para que quien
   * entre a Tareas HK siempre vea todo lo pendiente junto. Solo aplica a
   * 'planificado': una tarea en_proceso o terminado es un registro de lo
   * que ya pasó ese día, no algo por hacer.
   */
  private async rolloverPlanificadasVencidas(client: SupabaseClient, hotelId: string) {
    const { error } = await client
      .from('tareas_hk')
      .update({ created_at: new Date().toISOString() })
      .eq('hotel_id', hotelId)
      .eq('estado', 'planificado')
      .lt('created_at', inicioDeHoyLima().toISOString());
    if (error) throw error;
  }

  private async cargarTareaHotel(
    client: SupabaseClient,
    hotelId: string,
    tareaId: string,
  ): Promise<TareaHk> {
    const { data, error } = await client
      .from('tareas_hk')
      .select('id, hotel_id, habitacion_id, tipo, estado, con_huesped_dentro, asignado_a, notas')
      .eq('id', tareaId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Tarea de HK no encontrada en este hotel');
    return data as TareaHk;
  }
}
