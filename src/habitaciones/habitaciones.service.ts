import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { DisponibilidadService } from './disponibilidad/disponibilidad.service';
import { ValidarDisponibilidadDto } from './dto/validar-disponibilidad.dto';
import { ResultadoDisponibilidad } from './disponibilidad/disponibilidad.types';

@Injectable()
export class HabitacionesService {
  constructor(private readonly disponibilidad: DisponibilidadService) {}

  /**
   * Lista las habitaciones del hotel con su estado actual (el semáforo)
   * y, si existe, la próxima reserva futura -> esto alimenta el badge
   * "reservada para tal fecha" que pidió el cliente en el dashboard.
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

    const ahora = new Date().toISOString();

    const conProximaReserva = await Promise.all(
      (habitaciones ?? []).map(async (hab) => {
        const { data: proxima } = await client
          .from('reserva_habitacion')
          .select(
            `
            fecha_hora_checkin_prevista,
            fecha_hora_checkout_prevista,
            reservas!inner(estado, huespedes(nombres, apellidos))
          `,
          )
          .eq('habitacion_id', hab.id)
          .neq('reservas.estado', 'cancelada')
          .gte('fecha_hora_checkin_prevista', ahora)
          .order('fecha_hora_checkin_prevista', { ascending: true })
          .limit(1)
          .maybeSingle();

        return { ...hab, proximaReserva: proxima ?? null };
      }),
    );

    return conProximaReserva;
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
