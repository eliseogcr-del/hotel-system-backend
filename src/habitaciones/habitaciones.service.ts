import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { DisponibilidadService } from './disponibilidad/disponibilidad.service';
import { ValidarDisponibilidadDto } from './dto/validar-disponibilidad.dto';
import { ResultadoDisponibilidad } from './disponibilidad/disponibilidad.types';

// Mismo criterio de zona horaria que en caja/estadías: el servidor no
// corre necesariamente en hora de Lima.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function comoRelojLima(fecha: Date): Date {
  return new Date(fecha.getTime() - PERU_UTC_OFFSET_MS);
}

function fechaYMD(relojLima: Date): string {
  return `${relojLima.getUTCFullYear()}-${String(relojLima.getUTCMonth() + 1).padStart(2, '0')}-${String(relojLima.getUTCDate()).padStart(2, '0')}`;
}

// Convierte una fecha 'YYYY-MM-DD' (hora Lima) al instante UTC real de esa
// medianoche en Lima -- mismo patrón que reportes.service.ts.
function fechaLimaAInstante(fechaYMD: string): Date {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const relojLima = new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0));
  return new Date(relojLima.getTime() + PERU_UTC_OFFSET_MS);
}

function sumarDiasYMD(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Diferencia en días de calendario (Lima) entre dos 'YYYY-MM-DD'.
function diferenciaDiasYMD(desdeYMD: string, hastaYMD: string): number {
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((fechaLimaAInstante(hastaYMD).getTime() - fechaLimaAInstante(desdeYMD).getTime()) / msPorDia);
}

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
        id, hab_numero, piso, estado, mantenimiento_planificado, notas_operativas, visible_whatsapp,
        tipos_habitacion(id, nombre, aforo_max)
      `,
      )
      .eq('hotel_id', hotelId)
      .order('hab_numero', { ascending: true });

    if (error) throw error;

    // 'planificado' además de 'en_proceso': HK puede dejar una nota (ej.
    // "faltan toallas") antes de darle "Iniciar" a la tarea, y esa nota
    // debe verse en Habitaciones apenas se escribe, no recién cuando
    // arranca. El estado va aparte en el mapa para que el frontend solo
    // muestre el texto "En proceso de X" cuando de verdad está en_proceso
    // (una tarea recién planificada -- ej. justo después de un checkout --
    // no debe aparentar que HK ya empezó).
    const { data: tareasActivas, error: tareasError } = await client
      .from('tareas_hk')
      .select('habitacion_id, tipo, estado, notas')
      .eq('hotel_id', hotelId)
      .in('estado', ['planificado', 'en_proceso']);
    if (tareasError) throw tareasError;

    const tareaEnProcesoPorHabitacion = new Map<
      string,
      { tipo: 'limpieza' | 'mantenimiento'; estado: 'planificado' | 'en_proceso'; notas: string | null }
    >();
    for (const t of tareasActivas ?? []) {
      // Si por algún motivo hay más de una tarea activa para la misma
      // habitación (no debería pasar en operación normal), la en_proceso
      // manda sobre la planificado.
      const actual = tareaEnProcesoPorHabitacion.get(t.habitacion_id);
      if (!actual || t.estado === 'en_proceso') {
        tareaEnProcesoPorHabitacion.set(t.habitacion_id, { tipo: t.tipo, estado: t.estado, notas: t.notas });
      }
    }

    const { data: lineasActivas, error: lineasError } = await client
      .from('reserva_habitacion')
      .select(
        `
        habitacion_id, tarifa_dia, fecha_hora_checkout_prevista, observaciones, incluye_desayuno,
        reservas!inner(hotel_id, origen, creado_por_agente, huespedes(nombres, apellidos)),
        estadias!inner(id, checkin_real, estado_actual),
        cocheras(numero, tipo_vehiculo_permitido),
        vehiculos(tipo, placa)
      `,
      )
      .eq('reservas.hotel_id', hotelId)
      .eq('estadias.estado_actual', 'en_curso');

    if (lineasError) throw lineasError;

    // Reservas cuyo check-in previsto es HOY (hora Lima) y que todavía no
    // se convirtieron en estadía (aviso "hay que pasar a estadía" para
    // recepción, ver Habitaciones.tsx). `estadias` es 1:1 con
    // reserva_habitacion y solo se crea al hacer check-in real -- si viene
    // null, esa línea nunca tuvo check-in todavía.
    //
    // Acotado a las próximas 24h (hora Lima) por fecha_hora_checkin_prevista
    // -- sin esto, era un select de TODA la historia de reservas no
    // canceladas del hotel (crece para siempre), filtrado en memoria recién
    // acá. Con el filtro, usa el índice idx_reserva_hab_checkin y solo trae
    // las líneas de hoy.
    const hoyTexto = fechaYMD(comoRelojLima(new Date()));
    const inicioHoyInstante = fechaLimaAInstante(hoyTexto);
    const finHoyInstante = new Date(inicioHoyInstante.getTime() + 24 * 60 * 60 * 1000);

    const { data: reservasSinCheckin, error: reservasSinCheckinError } = await client
      .from('reserva_habitacion')
      .select(
        `
        id, habitacion_id, fecha_hora_checkin_prevista,
        reservas!inner(id, hotel_id, estado, origen, creado_por_agente, huespedes(nombres, apellidos), empresas(razon_social)),
        estadias(id)
      `,
      )
      .eq('reservas.hotel_id', hotelId)
      .neq('reservas.estado', 'cancelada')
      .gte('fecha_hora_checkin_prevista', inicioHoyInstante.toISOString())
      .lt('fecha_hora_checkin_prevista', finHoyInstante.toISOString());
    if (reservasSinCheckinError) throw reservasSinCheckinError;

    const reservaHoyPorHabitacion = new Map<
      string,
      {
        reservaId: string;
        lineaId: string;
        huesped: string | null;
        origen: string | null;
        creadoPorAgente: boolean;
      }
    >();
    for (const linea of (reservasSinCheckin ?? []) as any[]) {
      if (linea.estadias) continue;
      const huesped = linea.reservas.huespedes;
      const empresa = linea.reservas.empresas;
      reservaHoyPorHabitacion.set(linea.habitacion_id, {
        reservaId: linea.reservas.id,
        lineaId: linea.id,
        huesped: huesped ? `${huesped.nombres} ${huesped.apellidos}` : (empresa?.razon_social ?? null),
        origen: linea.reservas.origen ?? null,
        creadoPorAgente: linea.reservas.creado_por_agente ?? false,
      });
    }

    // Para las habitaciones realmente disponibles (sin huésped ni reserva
    // de hoy), cuántos días de margen quedan antes de que se tope con la
    // próxima reserva futura -- para que recepción sepa de un vistazo si
    // conviene ofrecerla para una estadía larga. Ventana de 30 días: más
    // allá de eso el frontend muestra "Más de 30 días" sin necesidad de
    // calcular la fecha exacta (ver diasHastaProximaReserva más abajo).
    const ventanaFinInstante = fechaLimaAInstante(sumarDiasYMD(hoyTexto, 31));

    const { data: proximasReservas, error: proximasReservasError } = await client
      .from('reserva_habitacion')
      .select(
        `
        habitacion_id, fecha_hora_checkin_prevista,
        reservas!inner(hotel_id, estado)
      `,
      )
      .eq('reservas.hotel_id', hotelId)
      .neq('reservas.estado', 'cancelada')
      .gte('fecha_hora_checkin_prevista', finHoyInstante.toISOString())
      .lt('fecha_hora_checkin_prevista', ventanaFinInstante.toISOString())
      .order('fecha_hora_checkin_prevista', { ascending: true });
    if (proximasReservasError) throw proximasReservasError;

    const diasHastaProximaReservaPorHabitacion = new Map<string, number>();
    for (const linea of (proximasReservas ?? []) as any[]) {
      // Ordenado ascendente por fecha -- la primera vez que aparece cada
      // habitación es su reserva futura más próxima.
      if (diasHastaProximaReservaPorHabitacion.has(linea.habitacion_id)) continue;
      const checkinYMD = fechaYMD(comoRelojLima(new Date(linea.fecha_hora_checkin_prevista)));
      diasHastaProximaReservaPorHabitacion.set(linea.habitacion_id, diferenciaDiasYMD(hoyTexto, checkinYMD));
    }

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
        incluyeDesayuno: linea.incluye_desayuno ?? false,
        notas: linea.observaciones,
        cocheraNumero: linea.cocheras?.numero ?? null,
        vehiculoTipo: linea.vehiculos?.tipo ?? null,
        // Para el badge de canal en la tarjeta (ver colorOrigen.ts en el
        // frontend) -- mismo criterio que el calendario de Reservas.
        origen: linea.reservas?.origen ?? null,
        creadoPorAgente: linea.reservas?.creado_por_agente ?? false,
      });
    }

    return (habitaciones ?? []).map((hab) => {
      // Solo tiene sentido avisar "hay que pasar a estadía" si la
      // habitación está físicamente libre ahora mismo -- si está ocupada,
      // en limpieza, etc, ese estado real manda sobre el aviso de reserva.
      const reservaHoy = hab.estado === 'disponible' ? (reservaHoyPorHabitacion.get(hab.id) ?? null) : null;
      // El aviso de "días disponible" solo aplica a una habitación
      // genuinamente libre ahora mismo -- si ya tiene una reserva de hoy
      // sin check-in, esa reserva es la próxima, no tiene sentido mostrar
      // el margen hasta "la siguiente después de esa".
      const diasHastaProximaReserva =
        hab.estado === 'disponible' && !reservaHoy
          ? (diasHastaProximaReservaPorHabitacion.get(hab.id) ?? null)
          : null;
      return {
        ...hab,
        reservaHoy,
        diasHastaProximaReserva,
        tareaHkEnProceso: tareaEnProcesoPorHabitacion.get(hab.id) ?? null,
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
          incluyeDesayuno: false,
          notas: null,
          cocheraNumero: null,
          vehiculoTipo: null,
          origen: null,
          creadoPorAgente: false,
        }),
      };
    });
  }

  /**
   * "Solicitar mantenimiento con huésped dentro" desde el panel de
   * Habitaciones. Solo tiene sentido si la habitación está 'ocupada'
   * (CLAUDE.md 3.2): con huésped dentro la habitación se queda 'ocupada'
   * (rojo) todo el tiempo, incluso mientras HK ya está trabajando en ella
   * (ver TareasHkService.iniciar), así que el checkbox sigue habilitado
   * de principio a fin. Activar crea la tarea (para que el HK la vea en
   * su cola); desactivar la cancela si todavía no la empezó, o la marca
   * como terminada si el HK ya la inició y se le olvidó cerrarla.
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
        .eq('con_huesped_dentro', true)
        .eq('estado', 'planificado');
      if (cancelError) throw cancelError;

      // Si el HK ya la había iniciado y se le olvidó marcarla terminada,
      // recepción puede cerrarla igual desmarcando el checkbox -- se
      // finaliza en vez de borrarse para no perder el registro histórico,
      // y se asume que el trabajo sí se hizo (por eso agrega la misma
      // nota que si el HK la hubiera cerrado él mismo).
      const { data: finalizadas, error: finalizarError } = await client
        .from('tareas_hk')
        .update({ estado: 'terminado', finalizado_en: new Date().toISOString(), notas: null })
        .eq('habitacion_id', habitacionId)
        .eq('tipo', 'mantenimiento')
        .eq('con_huesped_dentro', true)
        .eq('estado', 'en_proceso')
        .select('id');
      if (finalizarError) throw finalizarError;
      if (finalizadas && finalizadas.length > 0) {
        await this.agregarNotaMantenimiento(client, habitacionId);
      }
    }

    const { error: updError } = await client
      .from('habitaciones')
      .update({ mantenimiento_planificado: activar })
      .eq('id', habitacionId);
    if (updError) throw updError;

    return { mantenimientoPlanificado: activar };
  }

  /**
   * "Marcar disponible" manual desde el panel de Habitaciones: para cuando
   * HK ya terminó de limpiar/reparar en la vida real pero se le olvidó
   * cerrar la tarea desde su formulario. Solo aplica a 'limpieza' o
   * 'mantenimiento' -- nunca a 'ocupada' (habría un huésped adentro) ni a
   * mantenimiento con huésped dentro (ese caso nunca sale de 'ocupada',
   * se corrige desmarcando el checkbox, no desde aquí).
   */
  async marcarDisponible(client: SupabaseClient, hotelId: string, habitacionId: string) {
    const { data: hab, error: habError } = await client
      .from('habitaciones')
      .select('id, estado')
      .eq('id', habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (habError) throw habError;
    if (!hab) throw new NotFoundException('La habitación no existe en este hotel');
    if (hab.estado !== 'limpieza' && hab.estado !== 'mantenimiento') {
      throw new BadRequestException(
        `Solo se puede marcar disponible una habitación en 'limpieza' o 'mantenimiento' (está en '${hab.estado}')`,
      );
    }

    const tipoTarea = hab.estado === 'limpieza' ? 'limpieza' : 'mantenimiento';
    const { error: finalizarError } = await client
      .from('tareas_hk')
      .update({ estado: 'terminado', finalizado_en: new Date().toISOString() })
      .eq('habitacion_id', habitacionId)
      .eq('tipo', tipoTarea)
      .in('estado', ['planificado', 'en_proceso']);
    if (finalizarError) throw finalizarError;

    const cambiosHabitacion: Record<string, unknown> = { estado: 'disponible' };
    if (tipoTarea === 'mantenimiento') {
      cambiosHabitacion.mantenimiento_planificado = false;
    }

    const { error: updError } = await client
      .from('habitaciones')
      .update(cambiosHabitacion)
      .eq('id', habitacionId);
    if (updError) throw updError;

    return { estado: 'disponible' };
  }

  /**
   * Nota operativa de la habitación (independiente de la estadía o de una
   * tarea HK en curso): sirve para avisos como "faltan toallas" que
   * ayudan a recepción a decidir aun con la habitación disponible. A
   * diferencia de reserva_habitacion.observaciones (ligada al huésped
   * actual) o tareas_hk.notas (ligada a una tarea puntual), esta vive en
   * la habitación misma y no se borra sola con el check-in/checkout.
   */
  async actualizarNotas(
    client: SupabaseClient,
    hotelId: string,
    habitacionId: string,
    notas: string,
  ) {
    const { data, error } = await client
      .from('habitaciones')
      .update({ notas_operativas: notas || null })
      .eq('id', habitacionId)
      .eq('hotel_id', hotelId)
      .select('id, notas_operativas')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('La habitación no existe en este hotel');
    return data;
  }

  /**
   * A voluntad del recepcionista, editable en cualquier momento: si está en
   * false, el agente de WhatsApp nunca ofrece esta habitación aunque esté
   * realmente disponible (política comercial del hotel) -- no toca el motor
   * de disponibilidad real que usan reservas/cotizaciones hechas por el staff.
   */
  async actualizarVisibleWhatsapp(
    client: SupabaseClient,
    hotelId: string,
    habitacionId: string,
    visible: boolean,
  ) {
    const { data, error } = await client
      .from('habitaciones')
      .update({ visible_whatsapp: visible })
      .eq('id', habitacionId)
      .eq('hotel_id', hotelId)
      .select('id, visible_whatsapp')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('La habitación no existe en este hotel');
    return data;
  }

  /**
   * Agrega "se realizó el mantenimiento" a las notas del huésped activo
   * (reserva_habitacion.observaciones, la misma columna que edita
   * recepción desde Habitaciones) sin borrar lo que ya tenía escrito.
   * Duplica TareasHkService.agregarNotaMantenimiento -- son módulos
   * distintos y esta es la única pieza compartida, no vale la pena
   * extraer un servicio común solo para esto.
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
    const observaciones = (rh as any).observaciones
      ? `${(rh as any).observaciones} | ${notaNueva}`
      : notaNueva;

    const { error: updError } = await client
      .from('reserva_habitacion')
      .update({ observaciones })
      .eq('id', (rh as any).id);
    if (updError) throw updError;
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
