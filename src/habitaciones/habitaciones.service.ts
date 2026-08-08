import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { DisponibilidadService } from './disponibilidad/disponibilidad.service';
import { ValidarDisponibilidadDto } from './dto/validar-disponibilidad.dto';
import { ResultadoDisponibilidad } from './disponibilidad/disponibilidad.types';

@Injectable()
export class HabitacionesService {
  constructor(private readonly disponibilidad: DisponibilidadService) {}

  /**
   * Panel operativo: una fila por habitación con su estado (semáforo) y,
   * si hay una estadía en curso, el huésped actual + el desglose
   * financiero que necesita recepción para saber a quién cobrarle qué.
   * 3 queries totales sin importar cuántas habitaciones tenga el hotel
   * (habitaciones, líneas con estadía activa, movimientos de esas
   * estadías) — se arma todo en memoria en vez de N+1 por habitación.
   */
  async listarConEstado(client: SupabaseClient, hotelId: string) {
    const { data: habitaciones, error } = await client
      .from('habitaciones')
      .select(
        `
        id, hab_numero, piso, estado, mantenimiento_planificado,
        tipos_habitacion(id, nombre, aforo_max)
      `,
      )
      .eq('hotel_id', hotelId)
      .order('hab_numero', { ascending: true });

    if (error) throw error;

    const { data: lineasActivas, error: lineasError } = await client
      .from('reserva_habitacion')
      .select(
        `
        habitacion_id, tarifa_dia, fecha_hora_checkout_prevista, observaciones,
        reservas!inner(hotel_id, huespedes(nombres, apellidos)),
        estadias!inner(id, checkin_real, estado_actual)
      `,
      )
      .eq('reservas.hotel_id', hotelId)
      .eq('estadias.estado_actual', 'en_curso');

    if (lineasError) throw lineasError;

    const estadiaIds = (lineasActivas ?? []).map((l: any) => l.estadias.id);
    const movimientosPorEstadia = new Map<string, { tipo: string; monto: number }[]>();

    if (estadiaIds.length > 0) {
      const { data: movimientos, error: movError } = await client
        .from('movimientos_cuenta')
        .select('estadia_id, tipo, monto')
        .in('estadia_id', estadiaIds);
      if (movError) throw movError;

      for (const m of movimientos ?? []) {
        const lista = movimientosPorEstadia.get(m.estadia_id) ?? [];
        lista.push({ tipo: m.tipo, monto: Number(m.monto) });
        movimientosPorEstadia.set(m.estadia_id, lista);
      }
    }

    const detallePorHabitacion = new Map<string, Record<string, unknown>>();
    for (const linea of (lineasActivas ?? []) as any[]) {
      const estadiaId = linea.estadias.id;
      const movimientos = movimientosPorEstadia.get(estadiaId) ?? [];

      const totalAlquiler = movimientos
        .filter((m) => m.tipo === 'alquiler')
        .reduce((acc, m) => acc + m.monto, 0);
      const totalOtrosServicios = movimientos
        .filter((m) => m.tipo !== 'alquiler' && m.tipo !== 'pago')
        .reduce((acc, m) => acc + m.monto, 0);
      const totalPagado = Math.abs(
        movimientos.filter((m) => m.tipo === 'pago').reduce((acc, m) => acc + m.monto, 0),
      );

      const huesped = linea.reservas?.huespedes;

      detallePorHabitacion.set(linea.habitacion_id, {
        estadiaId,
        huesped: huesped ? `${huesped.nombres} ${huesped.apellidos}` : null,
        checkinReal: linea.estadias.checkin_real,
        checkoutPrevisto: linea.fecha_hora_checkout_prevista,
        tarifaDia: Number(linea.tarifa_dia),
        totalAlquiler,
        totalOtrosServicios,
        totalPagado,
        saldo: totalAlquiler + totalOtrosServicios - totalPagado,
        notas: linea.observaciones,
      });
    }

    return (habitaciones ?? []).map((hab) => ({
      ...hab,
      ...(detallePorHabitacion.get(hab.id) ?? {
        estadiaId: null,
        huesped: null,
        checkinReal: null,
        checkoutPrevisto: null,
        tarifaDia: null,
        totalAlquiler: null,
        totalOtrosServicios: null,
        totalPagado: null,
        saldo: null,
        notas: null,
      }),
    }));
  }

  /**
   * "Solicitar mantenimiento con huésped dentro" desde el panel de
   * Habitaciones. Solo tiene sentido si la habitación está 'ocupada'
   * (CLAUDE.md 3.2): el HK todavía no entra, la habitación sigue en rojo
   * hasta que él inicia la tarea desde TareasHkModule. Activar crea la
   * tarea (para que el HK la vea en su cola); desactivar la cancela SI
   * todavía no la empezó -- si ya la inició, el estado de la habitación ya
   * cambió a 'mantenimiento' y esta acción deja de estar disponible sola,
   * porque el checkbox solo se habilita con estado 'ocupada'.
   */
  async alternarMantenimientoConHuesped(
    client: SupabaseClient,
    hotelId: string,
    habitacionId: string,
    activar: boolean,
    personalId: string,
  ) {
    const { data: hab, error: habError } = await client
      .from('habitaciones')
      .select('id, estado, mantenimiento_planificado')
      .eq('id', habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (habError) throw habError;
    if (!hab) throw new NotFoundException('La habitación no existe en este hotel');
    if (hab.estado !== 'ocupada') {
      throw new BadRequestException(
        'Solo se puede marcar/desmarcar mantenimiento mientras la habitación está ocupada',
      );
    }

    if (activar) {
      const { error: tareaError } = await client.from('tareas_hk').insert({
        hotel_id: hotelId,
        habitacion_id: habitacionId,
        tipo: 'mantenimiento',
        con_huesped_dentro: true,
        estado: 'planificado',
        definido_por: personalId,
      });
      if (tareaError) throw tareaError;
    } else {
      const { error: cancelError } = await client
        .from('tareas_hk')
        .delete()
        .eq('habitacion_id', habitacionId)
        .eq('tipo', 'mantenimiento')
        .eq('estado', 'planificado');
      if (cancelError) throw cancelError;
    }

    const { error: updError } = await client
      .from('habitaciones')
      .update({ mantenimiento_planificado: activar })
      .eq('id', habitacionId);
    if (updError) throw updError;

    return { mantenimientoPlanificado: activar };
  }

  async validarDisponibilidad(
    client: SupabaseClient,
    hotelId: string,
    dto: ValidarDisponibilidadDto,
  ): Promise<ResultadoDisponibilidad> {
    // Confirmamos que la habitación pertenece al hotel antes de validar,
    // para no filtrar disponibilidad de habitaciones de otro cliente.
    const { data: hab, error } = await client
      .from('habitaciones')
      .select('id')
      .eq('id', dto.habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (error) throw error;
    if (!hab) {
      throw new NotFoundException(
        'La habitación no existe en este hotel',
      );
    }

    return this.disponibilidad.validar(client, {
      hotelId,
      habitacionId: dto.habitacionId,
      checkinPrevisto: dto.checkinPrevisto,
      checkoutPrevisto: dto.checkoutPrevisto,
      excluirReservaHabitacionId: dto.excluirReservaHabitacionId,
    });
  }
}
