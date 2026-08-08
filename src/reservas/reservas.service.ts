import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { DisponibilidadService } from '../habitaciones/disponibilidad/disponibilidad.service';
import { CrearReservaDto, OrigenReserva } from './dto/crear-reserva.dto';
import {
  CrearReservaHabitacionDto,
  TipoAlquiler,
} from './dto/crear-reserva-habitacion.dto';
import { ListarReservasQueryDto } from './dto/listar-reservas-query.dto';

interface TarifaVigente {
  minimo: number | null;
  normal: number;
  booking: number | null;
  airbnb: number | null;
}

interface LineaConCosto {
  linea: CrearReservaHabitacionDto;
  tarifaDia: number;
  dias: number;
  cargoAforoExtra: number;
  cobroEarly: number;
  cobroLate: number;
  subtotal: number;
}

@Injectable()
export class ReservasService {
  constructor(private readonly disponibilidad: DisponibilidadService) {}

  async crear(
    client: SupabaseClient,
    hotelId: string,
    dto: CrearReservaDto,
    personalId: string,
  ) {
    if (!dto.huespedId && !dto.empresaId) {
      throw new BadRequestException(
        'La reserva debe tener un huésped o una empresa asociada.',
      );
    }

    // 1. Validar disponibilidad de TODAS las líneas antes de tocar la base:
    // si una habitación de la reserva grupal choca, se rechaza la reserva
    // completa en vez de crearla a medias.
    for (const linea of dto.habitaciones) {
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: linea.habitacionId,
        checkinPrevisto: linea.checkinPrevisto,
        checkoutPrevisto: linea.checkoutPrevisto,
      });
      if (!resultado.disponible) {
        throw new ConflictException(resultado.conflicto);
      }
    }

    // 2. Resolver tarifa y costo de cada línea.
    const lineasConCosto = await Promise.all(
      dto.habitaciones.map((linea) =>
        this.resolverCostoLinea(client, hotelId, dto.origen, linea),
      ),
    );

    const descuentoTotal = dto.descuentoTotal ?? 0;
    const importeFinal =
      lineasConCosto.reduce((acc, l) => acc + l.subtotal, 0) - descuentoTotal;

    const fechaIngreso = dto.habitaciones.reduce((min, l) =>
      new Date(l.checkinPrevisto) < new Date(min.checkinPrevisto) ? l : min,
    ).checkinPrevisto;

    const fechaSalidaProg = dto.habitaciones
      .reduce((max, l) =>
        new Date(l.checkoutPrevisto) > new Date(max.checkoutPrevisto)
          ? l
          : max,
      )
      .checkoutPrevisto.slice(0, 10);

    const diasHospedaje = Math.max(...lineasConCosto.map((l) => l.dias));

    // 3. Insertar reserva + líneas. Sin RPC transaccional (el resto del
    // código sigue el mismo patrón de queries directas contra Supabase):
    // si insertar las líneas falla, se borra la reserva recién creada para
    // no dejar una reserva "fantasma" sin habitaciones.
    const { data: reserva, error: reservaError } = await client
      .from('reservas')
      .insert({
        hotel_id: hotelId,
        huesped_id: dto.huespedId ?? null,
        empresa_id: dto.empresaId ?? null,
        origen: dto.origen,
        codigo_externo: dto.codigoExterno ?? null,
        fecha_ingreso: fechaIngreso,
        dias_hospedaje: diasHospedaje,
        fecha_salida_prog: fechaSalidaProg,
        moneda: dto.moneda ?? 'PEN',
        deducible_impuestos: dto.deducibleImpuestos ?? true,
        descuento_total: descuentoTotal,
        importe_final: importeFinal,
        estado: 'confirmada',
        creado_por: personalId,
      })
      .select()
      .single();

    if (reservaError) throw reservaError;

    const filasReservaHabitacion = lineasConCosto.map((l) => ({
      reserva_id: reserva.id,
      habitacion_id: l.linea.habitacionId,
      nro_personas: l.linea.nroPersonas,
      incluye_desayuno: l.linea.incluyeDesayuno ?? false,
      tarifa_dia: l.tarifaDia,
      dias: l.dias,
      cargo_aforo_extra: l.cargoAforoExtra,
      cobro_early: l.cobroEarly,
      cobro_late: l.cobroLate,
      subtotal: l.subtotal,
      tipo_alquiler: l.linea.tipoAlquiler,
      fecha_hora_checkin_prevista: l.linea.checkinPrevisto,
      fecha_hora_checkout_prevista: l.linea.checkoutPrevisto,
      observaciones: l.linea.observaciones ?? null,
      cochera_id: l.linea.cocheraId ?? null,
    }));

    const { data: reservaHabitaciones, error: rhError } = await client
      .from('reserva_habitacion')
      .insert(filasReservaHabitacion)
      .select();

    if (rhError) {
      await client.from('reservas').delete().eq('id', reserva.id);
      throw rhError;
    }

    // 4. Vehículos, solo para las líneas que trajeron cochera + datos de placa.
    const vehiculosAInsertar = lineasConCosto
      .map((l, i) => ({ l, rh: reservaHabitaciones[i] }))
      .filter(
        ({ l }) =>
          l.linea.cocheraId &&
          (l.linea.vehiculoPlaca ||
            l.linea.vehiculoColor ||
            l.linea.vehiculoCaracteristicas),
      )
      .map(({ l, rh }) => ({
        reserva_habitacion_id: rh.id,
        placa: l.linea.vehiculoPlaca ?? null,
        color: l.linea.vehiculoColor ?? null,
        caracteristicas: l.linea.vehiculoCaracteristicas ?? null,
      }));

    if (vehiculosAInsertar.length > 0) {
      const { error: vehError } = await client
        .from('vehiculos')
        .insert(vehiculosAInsertar);
      if (vehError) throw vehError;
    }

    return this.obtenerDetalle(client, hotelId, reserva.id);
  }

  async listar(
    client: SupabaseClient,
    hotelId: string,
    filtros: ListarReservasQueryDto,
  ) {
    let query = client
      .from('reservas')
      .select(
        `
        id, origen, codigo_externo, fecha_ingreso, dias_hospedaje,
        fecha_salida_prog, moneda, descuento_total, importe_final, estado,
        created_at,
        huespedes(nombres, apellidos), empresas(razon_social),
        reserva_habitacion(
          id, habitacion_id, fecha_hora_checkin_prevista,
          fecha_hora_checkout_prevista, subtotal,
          habitaciones(hab_numero)
        )
      `,
      )
      .eq('hotel_id', hotelId)
      .order('fecha_ingreso', { ascending: false });

    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.desde) query = query.gte('fecha_ingreso', filtros.desde);
    if (filtros.hasta) query = query.lte('fecha_ingreso', filtros.hasta);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async obtenerDetalle(
    client: SupabaseClient,
    hotelId: string,
    reservaId: string,
  ) {
    const { data, error } = await client
      .from('reservas')
      .select(
        `
        *,
        huespedes(*), empresas(*),
        reserva_habitacion(
          *,
          habitaciones(hab_numero, piso, tipos_habitacion(nombre)),
          vehiculos(*)
        )
      `,
      )
      .eq('id', reservaId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Reserva no encontrada');
    return data;
  }

  async cancelar(client: SupabaseClient, hotelId: string, reservaId: string) {
    const { data, error } = await client
      .from('reservas')
      .update({ estado: 'cancelada' })
      .eq('id', reservaId)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Reserva no encontrada');
    return data;
  }

  /**
   * Agrega una línea de habitación a una reserva YA existente. Es lo que
   * permite "completar" una reserva creada sin habitaciones (ej. las que
   * llegan de ImportacionesCanalModule en 'pendiente_revision', donde el
   * texto libre del correo no alcanza para asignar un cuarto con
   * confianza) sin tener que recrearla desde cero.
   */
  async agregarHabitacion(
    client: SupabaseClient,
    hotelId: string,
    reservaId: string,
    linea: CrearReservaHabitacionDto,
  ) {
    const { data: reserva, error: reservaError } = await client
      .from('reservas')
      .select('id, origen, descuento_total, estado')
      .eq('id', reservaId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (reservaError) throw reservaError;
    if (!reserva) throw new NotFoundException('Reserva no encontrada en este hotel');
    if (reserva.estado === 'cancelada') {
      throw new BadRequestException('No se puede agregar habitaciones a una reserva cancelada');
    }

    const resultado = await this.disponibilidad.validar(client, {
      hotelId,
      habitacionId: linea.habitacionId,
      checkinPrevisto: linea.checkinPrevisto,
      checkoutPrevisto: linea.checkoutPrevisto,
    });
    if (!resultado.disponible) {
      throw new ConflictException(resultado.conflicto);
    }

    const costo = await this.resolverCostoLinea(
      client,
      hotelId,
      reserva.origen as OrigenReserva,
      linea,
    );

    const { data: nuevaLinea, error: insertError } = await client
      .from('reserva_habitacion')
      .insert({
        reserva_id: reservaId,
        habitacion_id: linea.habitacionId,
        nro_personas: linea.nroPersonas,
        incluye_desayuno: linea.incluyeDesayuno ?? false,
        tarifa_dia: costo.tarifaDia,
        dias: costo.dias,
        cargo_aforo_extra: costo.cargoAforoExtra,
        cobro_early: costo.cobroEarly,
        cobro_late: costo.cobroLate,
        subtotal: costo.subtotal,
        tipo_alquiler: linea.tipoAlquiler,
        fecha_hora_checkin_prevista: linea.checkinPrevisto,
        fecha_hora_checkout_prevista: linea.checkoutPrevisto,
        observaciones: linea.observaciones ?? null,
        cochera_id: linea.cocheraId ?? null,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    if (
      linea.cocheraId &&
      (linea.vehiculoPlaca || linea.vehiculoColor || linea.vehiculoCaracteristicas)
    ) {
      const { error: vehError } = await client.from('vehiculos').insert({
        reserva_habitacion_id: nuevaLinea.id,
        placa: linea.vehiculoPlaca ?? null,
        color: linea.vehiculoColor ?? null,
        caracteristicas: linea.vehiculoCaracteristicas ?? null,
      });
      if (vehError) throw vehError;
    }

    await this.recalcularTotales(client, reservaId, Number(reserva.descuento_total));

    return this.obtenerDetalle(client, hotelId, reservaId);
  }

  /**
   * pendiente_revision -> confirmada. El "un clic" que menciona CLAUDE.md
   * 3.6 para las reservas que llegan de Booking/Airbnb: exige que ya tenga
   * al menos una habitación asignada (si no, agregarHabitacion primero).
   */
  async confirmar(client: SupabaseClient, hotelId: string, reservaId: string) {
    const reserva = await this.obtenerDetalle(client, hotelId, reservaId);

    if (reserva.estado !== 'pendiente_revision') {
      throw new BadRequestException(
        `No se puede confirmar: la reserva está en estado '${reserva.estado}'`,
      );
    }
    if (!reserva.reserva_habitacion || reserva.reserva_habitacion.length === 0) {
      throw new BadRequestException(
        'No se puede confirmar una reserva sin ninguna habitación asignada; agrega al menos una primero',
      );
    }

    const { error } = await client
      .from('reservas')
      .update({ estado: 'confirmada' })
      .eq('id', reservaId);
    if (error) throw error;

    return this.obtenerDetalle(client, hotelId, reservaId);
  }

  private async recalcularTotales(
    client: SupabaseClient,
    reservaId: string,
    descuentoTotal: number,
  ) {
    const { data: lineas, error } = await client
      .from('reserva_habitacion')
      .select('subtotal, dias, fecha_hora_checkin_prevista, fecha_hora_checkout_prevista')
      .eq('reserva_id', reservaId);
    if (error) throw error;

    const filas = lineas ?? [];
    const importeFinal =
      filas.reduce((acc, l) => acc + Number(l.subtotal), 0) - descuentoTotal;
    const diasHospedaje = filas.reduce((max, l) => Math.max(max, l.dias), 1);
    const fechaIngreso = filas.reduce<string | null>(
      (min, l) => (!min || l.fecha_hora_checkin_prevista < min ? l.fecha_hora_checkin_prevista : min),
      null,
    );
    const fechaSalidaProg = filas.reduce<string | null>(
      (max, l) => (!max || l.fecha_hora_checkout_prevista > max ? l.fecha_hora_checkout_prevista : max),
      null,
    );

    const { error: updError } = await client
      .from('reservas')
      .update({
        importe_final: importeFinal,
        dias_hospedaje: diasHospedaje,
        ...(fechaIngreso ? { fecha_ingreso: fechaIngreso } : {}),
        ...(fechaSalidaProg ? { fecha_salida_prog: fechaSalidaProg.slice(0, 10) } : {}),
      })
      .eq('id', reservaId);
    if (updError) throw updError;
  }

  private async resolverCostoLinea(
    client: SupabaseClient,
    hotelId: string,
    origen: OrigenReserva,
    linea: CrearReservaHabitacionDto,
  ): Promise<LineaConCosto> {
    const { data: hab, error: habError } = await client
      .from('habitaciones')
      .select('id, tipo_id')
      .eq('id', linea.habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (habError) throw habError;
    if (!hab) {
      throw new NotFoundException(
        `La habitación ${linea.habitacionId} no existe en este hotel`,
      );
    }

    let tarifaDia = linea.tarifaDiaManual;
    if (tarifaDia === undefined) {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: tarifa, error: tarifaError } = await client
        .from('tarifas')
        .select('minimo, normal, booking, airbnb')
        .eq('hotel_id', hotelId)
        .eq('tipo_hab_id', hab.tipo_id)
        .lte('vigente_desde', hoy)
        .order('vigente_desde', { ascending: false })
        .limit(1)
        .maybeSingle<TarifaVigente>();

      if (tarifaError) throw tarifaError;
      if (!tarifa) {
        throw new NotFoundException(
          `No hay tarifa vigente para el tipo de habitación de ${linea.habitacionId}`,
        );
      }

      tarifaDia = this.tarifaSegunOrigen(tarifa, origen, linea.tipoAlquiler);
    }

    const dias =
      linea.diasManual ??
      this.calcularDias(linea.tipoAlquiler, linea.checkinPrevisto, linea.checkoutPrevisto);

    const cargoAforoExtra = linea.cargoAforoExtra ?? 0;
    const cobroEarly = linea.cobroEarly ?? 0;
    const cobroLate = linea.cobroLate ?? 0;
    const subtotal = tarifaDia * dias + cargoAforoExtra + cobroEarly + cobroLate;

    return { linea, tarifaDia, dias, cargoAforoExtra, cobroEarly, cobroLate, subtotal };
  }

  private tarifaSegunOrigen(
    tarifa: TarifaVigente,
    origen: OrigenReserva,
    tipoAlquiler: TipoAlquiler,
  ): number {
    if (tipoAlquiler === 'por_horas') return tarifa.minimo ?? tarifa.normal;
    if (origen === 'booking') return tarifa.booking ?? tarifa.normal;
    if (origen === 'airbnb') return tarifa.airbnb ?? tarifa.normal;
    return tarifa.normal;
  }

  private calcularDias(
    tipoAlquiler: TipoAlquiler,
    checkinPrevisto: string,
    checkoutPrevisto: string,
  ): number {
    if (tipoAlquiler === 'por_horas') return 1;
    const noches = Math.ceil(
      (new Date(checkoutPrevisto).getTime() -
        new Date(checkinPrevisto).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    return Math.max(1, noches);
  }
}
