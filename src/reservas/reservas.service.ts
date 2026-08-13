import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { DisponibilidadService } from '../habitaciones/disponibilidad/disponibilidad.service';
import { CrearReservaDto, OrigenReserva } from './dto/crear-reserva.dto';
import {
  CrearReservaHabitacionDto,
  TipoAlquiler,
  TipoCliente,
} from './dto/crear-reserva-habitacion.dto';
import { ListarReservasQueryDto } from './dto/listar-reservas-query.dto';
import { CalendarioQueryDto } from './dto/calendario-query.dto';
import { ActualizarReservaLineaDto } from './dto/actualizar-reserva-linea.dto';
import { CancelarReservaDto } from './dto/cancelar-reserva.dto';

type MetodoPagoAnticipo = 'efectivo' | 'transferencia' | 'yape' | 'tarjeta';

interface PreciosTipoHabitacion {
  precio_normal: number;
  precio_corporativo: number;
  precio_web: number;
  precio_por_hora: number | null;
  precio_costo: number;
}

interface LineaConCosto {
  linea: CrearReservaHabitacionDto;
  tarifaDia: number;
  dias: number;
  cargoAforoExtra: number;
  cobroEarly: number;
  cobroLate: number;
  cobroMascota: number;
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
    // completa en vez de crearla a medias. Mismo criterio para las cocheras
    // que traiga cada línea: deben estar 'disponible' en este momento.
    for (const linea of dto.habitaciones) {
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: linea.habitacionId,
        checkinPrevisto: linea.checkinPrevisto,
        checkoutPrevisto: linea.checkoutPrevisto,
      });
      if (!resultado.disponible) {
        throw new ConflictException(resultado.conflicto?.mensaje ?? 'La habitación no está disponible en ese rango');
      }

      if (linea.cocheraId) {
        const { data: cochera, error: cocheraError } = await client
          .from('cocheras')
          .select('id, estado, hotel_id')
          .eq('id', linea.cocheraId)
          .maybeSingle();
        if (cocheraError) throw cocheraError;
        if (!cochera || cochera.hotel_id !== hotelId) {
          throw new NotFoundException('Cochera no encontrada en este hotel');
        }
        if (cochera.estado !== 'disponible') {
          throw new BadRequestException('Esa cochera ya está ocupada');
        }
      }
    }

    // 2. Resolver tarifa y costo de cada línea.
    const lineasConCosto = await Promise.all(
      dto.habitaciones.map((linea) =>
        this.resolverCostoLinea(client, hotelId, dto.origen, linea, dto.empresaId),
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
      con_mascota: l.linea.conMascota ?? false,
      cobro_mascota: l.cobroMascota,
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

    // 4. Vehículos, solo para las líneas que trajeron cochera + algún dato del vehículo.
    const vehiculosAInsertar = lineasConCosto
      .map((l, i) => ({ l, rh: reservaHabitaciones[i] }))
      .filter(
        ({ l }) =>
          l.linea.cocheraId &&
          (l.linea.vehiculoPlaca ||
            l.linea.vehiculoMarca ||
            l.linea.vehiculoTipo ||
            l.linea.vehiculoColor ||
            l.linea.vehiculoCaracteristicas),
      )
      .map(({ l, rh }) => ({
        reserva_habitacion_id: rh.id,
        marca: l.linea.vehiculoMarca ?? null,
        tipo: l.linea.vehiculoTipo ?? null,
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

    // 5. Marcar como 'ocupada' cada cochera asignada (ya se validó que
    // estaban 'disponible' en el paso 1, antes de tocar la base).
    const cocheraIds = lineasConCosto
      .map((l) => l.linea.cocheraId)
      .filter((id): id is string => !!id);
    if (cocheraIds.length > 0) {
      const { error: cocheraOcuparError } = await client
        .from('cocheras')
        .update({ estado: 'ocupada' })
        .in('id', cocheraIds);
      if (cocheraOcuparError) throw cocheraOcuparError;
    }

    // 6. Anticipo opcional (pago adelantado de la reserva).
    if (dto.anticipoMonto) {
      await this.procesarAnticipo(
        client,
        hotelId,
        reserva.id,
        dto.anticipoMonto,
        dto.anticipoMetodoPago,
        personalId,
      );
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

  async obtenerCalendario(
    client: SupabaseClient,
    hotelId: string,
    desde: string,
    hasta: string,
  ) {
    const { data, error } = await client
      .from('reserva_habitacion')
      .select(
        `
        id, habitacion_id, fecha_hora_checkin_prevista, fecha_hora_checkout_prevista,
        reservas!inner(id, estado, hotel_id, huespedes(nombres, apellidos), empresas(razon_social)),
        estadias(id, estado_actual)
      `,
      )
      .eq('reservas.hotel_id', hotelId)
      .neq('reservas.estado', 'cancelada')
      .lte('fecha_hora_checkin_prevista', `${hasta}T23:59:59`)
      .gte('fecha_hora_checkout_prevista', `${desde}T00:00:00`);
    if (error) throw error;

    return (data ?? [])
      .filter((r: any) => r.estadias?.estado_actual !== 'finalizada')
      .map((r: any) => ({
        id: r.id,
        habitacionId: r.habitacion_id,
        checkinPrevisto: r.fecha_hora_checkin_prevista,
        checkoutPrevisto: r.fecha_hora_checkout_prevista,
        reservaId: r.reservas.id,
        estadoReserva: r.reservas.estado,
        // Si ya hay una estadía 'en_curso', el huésped ya está físicamente
        // alojado -- el frontend debe llevar a EstadiaDetalle.tsx (el
        // libro real) en vez de abrir el formulario de edición de reserva.
        estadiaId: r.estadias?.id ?? null,
        estadoEstadia: r.estadias?.estado_actual ?? null,
        huesped: r.reservas.huespedes
          ? `${r.reservas.huespedes.nombres} ${r.reservas.huespedes.apellidos}`
          : (r.reservas.empresas?.razon_social ?? '—'),
      }));
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

  /**
   * Anula la reserva completa (todas sus líneas). No se permite si
   * cualquiera de sus líneas ya tiene una estadía asociada (hubo check-in
   * real) -- anularla dejaría un huésped físicamente alojado colgado de
   * una reserva 'cancelada', un estado inconsistente. Un anticipo ya
   * registrado NO bloquea la anulación (es solo informativo para quien la
   * anula); el dinero ya cobrado queda registrado igual en su libro de
   * caja/movimientos, la anulación no lo revierte.
   */
  async cancelar(
    client: SupabaseClient,
    hotelId: string,
    reservaId: string,
    dto: CancelarReservaDto,
    personalId: string,
  ) {
    const { data: lineas, error: lineasError } = await client
      .from('reserva_habitacion')
      .select('id, estadias(estado_actual)')
      .eq('reserva_id', reservaId);
    if (lineasError) throw lineasError;

    const tieneEstadia = (lineas ?? []).some((l: any) => l.estadias);
    if (tieneEstadia) {
      throw new BadRequestException(
        'No se puede anular: esta reserva ya tiene una estadía asociada (hubo check-in). Si corresponde, gestiónalo desde el detalle de la estadía.',
      );
    }

    const { data, error } = await client
      .from('reservas')
      .update({
        estado: 'cancelada',
        motivo_cancelacion: dto?.motivo?.trim() || null,
        cancelado_por: personalId,
        cancelado_en: new Date().toISOString(),
      })
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
      .select('id, origen, empresa_id, descuento_total, estado')
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
      throw new ConflictException(resultado.conflicto?.mensaje ?? 'La habitación no está disponible en ese rango');
    }

    const costo = await this.resolverCostoLinea(
      client,
      hotelId,
      reserva.origen as OrigenReserva,
      linea,
      reserva.empresa_id ?? undefined,
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
        con_mascota: linea.conMascota ?? false,
        cobro_mascota: costo.cobroMascota,
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
   * Editar una reserva que todavía no tiene check-in, desde el formulario
   * del calendario (click en una celda ya ocupada por una reserva
   * 'pendiente'). No cambia la habitación -- eso implicaría mover la
   * celda, fuera de alcance de este formulario. Si cambia checkin/días,
   * revalida disponibilidad excluyéndose a sí misma (mismo motor que
   * crear()/agregarHabitacion()).
   */
  async actualizarLinea(
    client: SupabaseClient,
    hotelId: string,
    reservaId: string,
    lineaId: string,
    dto: ActualizarReservaLineaDto,
    personalId: string,
  ) {
    const { data: rh, error: rhError } = await client
      .from('reserva_habitacion')
      .select(
        `
        id, habitacion_id, nro_personas, incluye_desayuno, con_mascota, tarifa_dia, dias,
        tipo_alquiler, fecha_hora_checkin_prevista, fecha_hora_checkout_prevista,
        reservas!inner(id, hotel_id, estado, origen, moneda, descuento_total, anticipo_monto),
        vehiculos(id, marca, tipo, placa),
        estadias(estado_actual)
      `,
      )
      .eq('id', lineaId)
      .eq('reserva_id', reservaId)
      .maybeSingle();
    if (rhError) throw rhError;

    const rhData = rh as any;
    const reserva = rhData?.reservas;
    if (!rh || reserva.hotel_id !== hotelId) {
      throw new NotFoundException('La línea de reserva no existe en este hotel');
    }
    if (reserva.estado === 'cancelada') {
      throw new BadRequestException('No se puede editar una reserva cancelada');
    }
    if (rhData.estadias && rhData.estadias.estado_actual !== 'pendiente') {
      throw new BadRequestException(
        'Esta reserva ya tiene un check-in en curso; edítala desde el detalle de la estadía.',
      );
    }
    if (dto.anticipoMonto !== undefined && dto.anticipoMonto > 0) {
      if (Number(reserva.anticipo_monto) > 0) {
        throw new BadRequestException(
          'Esta reserva ya tiene un anticipo registrado; no se puede modificar (el libro de movimientos nunca se edita retroactivamente).',
        );
      }
      if (!dto.anticipoMetodoPago) {
        throw new BadRequestException('anticipoMetodoPago es requerido para registrar un anticipo');
      }
    }

    const checkinNuevo = dto.checkinPrevisto ?? rhData.fecha_hora_checkin_prevista;
    const diasNuevo = dto.diasManual ?? rhData.dias;
    const checkoutNuevo = new Date(
      new Date(checkinNuevo).getTime() + diasNuevo * 24 * 60 * 60 * 1000,
    ).toISOString();

    if (dto.checkinPrevisto !== undefined || dto.diasManual !== undefined) {
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: rhData.habitacion_id,
        checkinPrevisto: checkinNuevo,
        checkoutPrevisto: checkoutNuevo,
        excluirReservaHabitacionId: lineaId,
      });
      if (!resultado.disponible) {
        throw new ConflictException(resultado.conflicto?.mensaje ?? 'La habitación no está disponible en ese rango');
      }
    }

    const lineaParaCosto: CrearReservaHabitacionDto = {
      habitacionId: rhData.habitacion_id,
      nroPersonas: dto.nroPersonas ?? rhData.nro_personas,
      incluyeDesayuno: dto.incluyeDesayuno ?? rhData.incluye_desayuno,
      conMascota: dto.conMascota ?? rhData.con_mascota,
      tipoAlquiler: rhData.tipo_alquiler,
      checkinPrevisto: checkinNuevo,
      checkoutPrevisto: checkoutNuevo,
      tarifaDiaManual: dto.tarifaDiaManual ?? Number(rhData.tarifa_dia),
      diasManual: diasNuevo,
    };

    const costo = await this.resolverCostoLinea(
      client,
      hotelId,
      (dto.origen ?? reserva.origen) as OrigenReserva,
      lineaParaCosto,
    );

    const { error: updError } = await client
      .from('reserva_habitacion')
      .update({
        nro_personas: costo.linea.nroPersonas,
        incluye_desayuno: costo.linea.incluyeDesayuno ?? false,
        con_mascota: costo.linea.conMascota ?? false,
        cobro_mascota: costo.cobroMascota,
        tarifa_dia: costo.tarifaDia,
        dias: costo.dias,
        subtotal: costo.subtotal,
        fecha_hora_checkin_prevista: checkinNuevo,
        fecha_hora_checkout_prevista: checkoutNuevo,
        ...(dto.observaciones !== undefined ? { observaciones: dto.observaciones } : {}),
      })
      .eq('id', lineaId);
    if (updError) throw updError;

    if (
      dto.vehiculoMarca !== undefined ||
      dto.vehiculoTipo !== undefined ||
      dto.vehiculoPlaca !== undefined
    ) {
      const vehiculoExistente = rhData.vehiculos;
      const datosVehiculo = {
        marca: dto.vehiculoMarca ?? vehiculoExistente?.marca ?? null,
        tipo: dto.vehiculoTipo ?? vehiculoExistente?.tipo ?? null,
        placa: dto.vehiculoPlaca ?? vehiculoExistente?.placa ?? null,
      };
      if (vehiculoExistente) {
        const { error } = await client
          .from('vehiculos')
          .update(datosVehiculo)
          .eq('id', vehiculoExistente.id);
        if (error) throw error;
      } else {
        const { error } = await client
          .from('vehiculos')
          .insert({ reserva_habitacion_id: lineaId, ...datosVehiculo });
        if (error) throw error;
      }
    }

    const cambiosReserva: Record<string, unknown> = {};
    if (dto.origen !== undefined) cambiosReserva.origen = dto.origen;
    if (dto.moneda !== undefined) cambiosReserva.moneda = dto.moneda;
    if (Object.keys(cambiosReserva).length > 0) {
      const { error } = await client.from('reservas').update(cambiosReserva).eq('id', reservaId);
      if (error) throw error;
    }

    await this.recalcularTotales(client, reservaId, Number(reserva.descuento_total ?? 0));

    if (dto.anticipoMonto) {
      await this.procesarAnticipo(
        client,
        hotelId,
        reservaId,
        dto.anticipoMonto,
        dto.anticipoMetodoPago,
        personalId,
      );
    }

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
    empresaId?: string,
  ): Promise<LineaConCosto> {
    const { data: hab, error: habError } = await client
      .from('habitaciones')
      .select(
        'id, tipo_id, tipos_habitacion(precio_normal, precio_corporativo, precio_web, precio_por_hora, precio_costo)',
      )
      .eq('id', linea.habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();

    if (habError) throw habError;
    if (!hab) {
      throw new NotFoundException(
        `La habitación ${linea.habitacionId} no existe en este hotel`,
      );
    }

    const precios = (hab as any).tipos_habitacion as PreciosTipoHabitacion | null;
    if (!precios) {
      throw new NotFoundException(
        `No se encontró el tipo de habitación de ${linea.habitacionId}`,
      );
    }

    let tarifaDia = linea.tarifaDiaManual;
    if (tarifaDia === undefined) {
      tarifaDia = this.tarifaSegunTipoCliente(
        precios,
        linea.tipoCliente ?? this.inferirTipoCliente(origen, empresaId),
        linea.tipoAlquiler,
      );
    }

    const precioCosto = Number(precios.precio_costo);
    if (precioCosto > 0 && tarifaDia < precioCosto) {
      throw new BadRequestException(
        `La tarifa (S/. ${tarifaDia}) no puede ser menor al precio de costo configurado para este tipo de habitación (S/. ${precioCosto})`,
      );
    }

    const dias =
      linea.diasManual ??
      this.calcularDias(linea.tipoAlquiler, linea.checkinPrevisto, linea.checkoutPrevisto);

    const cargoAforoExtra = linea.cargoAforoExtra ?? 0;
    const cobroEarly = linea.cobroEarly ?? 0;
    const cobroLate = linea.cobroLate ?? 0;

    let cobroMascota = 0;
    if (linea.conMascota) {
      const precioMascotaDia = await this.obtenerPrecioMascota(client, hotelId);
      cobroMascota = precioMascotaDia * dias;
    }

    const subtotal =
      tarifaDia * dias + cargoAforoExtra + cobroEarly + cobroLate + cobroMascota;

    return { linea, tarifaDia, dias, cargoAforoExtra, cobroEarly, cobroLate, cobroMascota, subtotal };
  }

  private async obtenerPrecioMascota(client: SupabaseClient, hotelId: string): Promise<number> {
    const { data, error } = await client
      .from('hoteles')
      .select('precio_mascota')
      .eq('id', hotelId)
      .maybeSingle();
    if (error) throw error;
    return Number((data as any)?.precio_mascota ?? 0);
  }

  /**
   * Anticipo (pago adelantado) de una reserva. El método de pago lo decide
   * quien reserva: solo si es 'efectivo' genera un ingreso en la caja de
   * la sesión de turno abierta de quien lo registra (yape/tarjeta/
   * transferencia van directo a la cuenta de la empresa, mismo criterio
   * que el resto del sistema -- ver CajaService). Se enlaza a la estadía
   * real recién al hacer check-in (EstadiasService.checkin()).
   */
  private async procesarAnticipo(
    client: SupabaseClient,
    hotelId: string,
    reservaId: string,
    monto: number,
    metodoPago: MetodoPagoAnticipo | undefined,
    personalId: string,
  ) {
    if (!metodoPago) {
      throw new BadRequestException(
        'anticipoMetodoPago es requerido para registrar un anticipo',
      );
    }

    let sesionTurnoId: string | null = null;
    if (metodoPago === 'efectivo') {
      sesionTurnoId = await this.obtenerSesionAbierta(client, hotelId, personalId);
      const { error: cajaError } = await client.from('movimientos_caja').insert({
        sesion_turno_id: sesionTurnoId,
        tipo: 'ingreso',
        monto,
        concepto: 'Anticipo de reserva',
        metodo_pago: metodoPago,
      });
      if (cajaError) throw cajaError;
    }

    const { error } = await client
      .from('reservas')
      .update({
        anticipo_monto: monto,
        anticipo_metodo_pago: metodoPago,
        anticipo_registrado_por: personalId,
        anticipo_sesion_turno_id: sesionTurnoId,
        anticipo_fecha: new Date().toISOString(),
      })
      .eq('id', reservaId);
    if (error) throw error;
  }

  private async obtenerSesionAbierta(
    client: SupabaseClient,
    hotelId: string,
    personalId: string,
  ): Promise<string> {
    const { data: personalHotel, error: phError } = await client
      .from('personal_hotel')
      .select('id')
      .eq('personal_id', personalId)
      .eq('hotel_id', hotelId)
      .eq('activo', true)
      .maybeSingle();
    if (phError) throw phError;
    if (!personalHotel) {
      throw new ForbiddenException('No tienes una asignación activa en este hotel');
    }

    const { data: sesion, error: sesError } = await client
      .from('sesiones_turno')
      .select('id')
      .eq('personal_hotel_id', personalHotel.id)
      .eq('estado', 'abierta')
      .order('abierta_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sesError) throw sesError;
    if (!sesion) {
      throw new BadRequestException(
        'No tienes una sesión de turno abierta en este hotel; ábrela antes de registrar un anticipo en efectivo.',
      );
    }
    return sesion.id;
  }

  // Sin selección explícita del recepcionista: empresa asociada -> cliente
  // corporativo; reserva que llegó de un canal online (Booking/Airbnb) ->
  // precio web; el resto (teléfono/whatsapp/directo/walkin) -> normal.
  private inferirTipoCliente(origen: OrigenReserva, empresaId?: string): TipoCliente {
    if (empresaId) return 'corporativo';
    if (origen === 'booking' || origen === 'airbnb') return 'web';
    return 'normal';
  }

  private tarifaSegunTipoCliente(
    precios: PreciosTipoHabitacion,
    tipoCliente: TipoCliente,
    tipoAlquiler: TipoAlquiler,
  ): number {
    if (tipoAlquiler === 'por_horas') {
      if (precios.precio_por_hora == null) {
        throw new BadRequestException(
          'Este tipo de habitación no tiene configurado un precio por hora',
        );
      }
      return Number(precios.precio_por_hora);
    }
    if (tipoCliente === 'corporativo') return Number(precios.precio_corporativo);
    if (tipoCliente === 'web') return Number(precios.precio_web);
    return Number(precios.precio_normal);
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
