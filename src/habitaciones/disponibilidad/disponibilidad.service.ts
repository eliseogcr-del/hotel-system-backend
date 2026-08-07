import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  ConflictoDisponibilidad,
  ResultadoDisponibilidad,
  ValidarDisponibilidadInput,
} from './disponibilidad.types';

/**
 * EL MOTOR DE DISPONIBILIDAD
 * ---------------------------------------------------------------------
 * Esta es la pieza que evita el doble-booking que describió el cliente:
 *
 *  - Si la habitación 101 tiene una reserva confirmada para mañana 7am,
 *    NO se puede alquilar hoy si el checkout de hoy no deja margen para
 *    que HK la limpie antes de las 7am (el margen depende del tipo de
 *    habitación: 40min una matrimonial, 2h una cuádruple, etc).
 *
 *  - Si alguien alquila por horas y sale a las 10pm, pero HK recién
 *    entra a las 9am del día siguiente, ese alquiler por horas debe
 *    BLOQUEARSE si no deja margen suficiente antes de la próxima
 *    reserva conocida (el margen de limpieza en sí lo cubre este mismo
 *    chequeo; la disponibilidad real del personal de HK es un chequeo
 *    operativo aparte que se resuelve en el módulo de tareas_hk, no
 *    bloqueando la reserva).
 *
 * Regla de bloqueo DURO (tal como pidió el cliente: no debe dejar
 * continuar al recepcionista):
 *   1. Solapamiento directo de rangos -> bloqueo.
 *   2. Gap entre reservas menor al tiempo_limpieza_min del tipo de
 *      habitación -> bloqueo.
 */
@Injectable()
export class DisponibilidadService {
  async validar(
    client: SupabaseClient,
    input: ValidarDisponibilidadInput,
  ): Promise<ResultadoDisponibilidad> {
    const { habitacionId, checkinPrevisto, checkoutPrevisto } = input;

    const nuevoCheckin = new Date(checkinPrevisto);
    const nuevoCheckout = new Date(checkoutPrevisto);

    if (nuevoCheckout <= nuevoCheckin) {
      return {
        disponible: false,
        conflicto: {
          motivo: 'SOLAPA_RESERVA_EXISTENTE',
          mensaje:
            'La fecha/hora de checkout debe ser posterior a la de checkin.',
        },
      };
    }

    // 1. Tiempo de limpieza según el tipo de habitación
    const { data: habitacion, error: habError } = await client
      .from('habitaciones')
      .select('id, tipo_id, tipos_habitacion(tiempo_limpieza_min)')
      .eq('id', habitacionId)
      .single();

    if (habError || !habitacion) {
      return {
        disponible: false,
        conflicto: {
          motivo: 'SOLAPA_RESERVA_EXISTENTE',
          mensaje: 'Habitación no encontrada.',
        },
      };
    }

    const tipoHabitacion = habitacion.tipos_habitacion as unknown as {
      tiempo_limpieza_min: number;
    } | null;
    const tiempoLimpiezaMin = tipoHabitacion?.tiempo_limpieza_min ?? 45;

    // 2. Traer reservas activas de esa habitación que puedan chocar
    // (ampliamos el rango de búsqueda +/- 1 día del rango solicitado
    // para no traer toda la historia de la habitación)
    const margenBusqueda = 24 * 60 * 60 * 1000; // 1 día en ms
    const desde = new Date(nuevoCheckin.getTime() - margenBusqueda).toISOString();
    const hasta = new Date(nuevoCheckout.getTime() + margenBusqueda).toISOString();

    let query = client
      .from('reserva_habitacion')
      .select(
        `
        id,
        fecha_hora_checkin_prevista,
        fecha_hora_checkout_prevista,
        reservas!inner(id, estado, huespedes(nombres, apellidos))
      `,
      )
      .eq('habitacion_id', habitacionId)
      .neq('reservas.estado', 'cancelada')
      .gte('fecha_hora_checkout_prevista', desde)
      .lte('fecha_hora_checkin_prevista', hasta);

    if (input.excluirReservaHabitacionId) {
      query = query.neq('id', input.excluirReservaHabitacionId);
    }

    const { data: existentes, error: resError } = await query;

    if (resError) {
      throw resError;
    }

    const margenMs = tiempoLimpiezaMin * 60 * 1000;

    for (const existente of existentes ?? []) {
      const existCheckin = new Date(existente.fecha_hora_checkin_prevista);
      const existCheckout = new Date(existente.fecha_hora_checkout_prevista);

      const huesped = (existente as any).reservas?.huespedes;
      const nombreHuesped = huesped
        ? `${huesped.nombres} ${huesped.apellidos}`
        : 'huésped con reserva';

      // Solapamiento directo
      const solapa =
        nuevoCheckin < existCheckout && nuevoCheckout > existCheckin;

      if (solapa) {
        const conflicto: ConflictoDisponibilidad = {
          motivo: 'SOLAPA_RESERVA_EXISTENTE',
          mensaje: `La habitación ya está reservada para ${nombreHuesped} en ese rango.`,
          reservaHabitacionId: existente.id,
          huesped: nombreHuesped,
          checkinConflicto: existente.fecha_hora_checkin_prevista,
          checkoutConflicto: existente.fecha_hora_checkout_prevista,
        };
        return { disponible: false, conflicto };
      }

      // Nuevo alquiler termina ANTES de que empiece el existente:
      // ¿queda margen de limpieza suficiente?
      if (nuevoCheckout <= existCheckin) {
        const gapMs = existCheckin.getTime() - nuevoCheckout.getTime();
        if (gapMs < margenMs) {
          const minutosFaltantes = Math.ceil((margenMs - gapMs) / 60000);
          return {
            disponible: false,
            conflicto: {
              motivo: 'SIN_MARGEN_LIMPIEZA',
              mensaje: `No queda margen de limpieza antes de la reserva de ${nombreHuesped} (faltan ${minutosFaltantes} min).`,
              reservaHabitacionId: existente.id,
              huesped: nombreHuesped,
              checkinConflicto: existente.fecha_hora_checkin_prevista,
              minutosFaltantes,
            },
          };
        }
      }

      // Nuevo alquiler empieza DESPUÉS de que termina el existente:
      // ¿queda margen de limpieza suficiente antes de este nuevo checkin?
      if (nuevoCheckin >= existCheckout) {
        const gapMs = nuevoCheckin.getTime() - existCheckout.getTime();
        if (gapMs < margenMs) {
          const minutosFaltantes = Math.ceil((margenMs - gapMs) / 60000);
          return {
            disponible: false,
            conflicto: {
              motivo: 'SIN_MARGEN_LIMPIEZA',
              mensaje: `No queda margen de limpieza después del checkout de ${nombreHuesped} (faltan ${minutosFaltantes} min).`,
              reservaHabitacionId: existente.id,
              huesped: nombreHuesped,
              checkoutConflicto: existente.fecha_hora_checkout_prevista,
              minutosFaltantes,
            },
          };
        }
      }
    }

    return { disponible: true };
  }
}
