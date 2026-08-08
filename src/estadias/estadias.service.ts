import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CheckinDto } from './dto/checkin.dto';
import { CheckinRapidoDto } from './dto/checkin-rapido.dto';
import { CheckoutDto } from './dto/checkout.dto';
import {
  RegistrarMovimientoDto,
  TipoMovimientoCuenta,
  MetodoPago,
} from './dto/registrar-movimiento.dto';
import { ListarEstadiasQueryDto } from './dto/listar-estadias-query.dto';
import { ActualizarNotasDto } from './dto/actualizar-notas.dto';
import { ReservasService } from '../reservas/reservas.service';
import { CrearReservaDto } from '../reservas/dto/crear-reserva.dto';

interface HotelHoras {
  hora_checkin: string;
  hora_checkout: string;
  modo_24h: boolean;
}

// Perú (America/Lima) es UTC-5 todo el año, sin horario de verano. Las horas
// de check-in/checkout que configura el hotel son hora de Lima, pero el
// servidor (Render en producción) no necesariamente corre con esa zona
// horaria -- Date.setHours()/getHours() usan la hora LOCAL DEL PROCESO, así
// que para comparar contra hora_checkin/hora_checkout hay que traducir el
// instante real a "reloj de pared de Lima" explícitamente en vez de confiar
// en el TZ del servidor.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function comoRelojLima(fecha: Date): Date {
  return new Date(fecha.getTime() - PERU_UTC_OFFSET_MS);
}

function desdeRelojLima(relojLima: Date): Date {
  return new Date(relojLima.getTime() + PERU_UTC_OFFSET_MS);
}

interface EstadiaConReserva {
  id: string;
  estado_actual: 'pendiente' | 'en_curso' | 'finalizada';
  saldo: number;
  checkin_real: string | null;
  checkout_real: string | null;
  reserva_habitacion: {
    id: string;
    habitacion_id: string;
    subtotal: number;
    tarifa_dia: number;
    habitaciones: { hab_numero: number; piso: number } | null;
    reservas: {
      hotel_id: string;
      estado: string;
      huespedes: { nombres: string; apellidos: string } | null;
    };
  };
}

@Injectable()
export class EstadiasService {
  constructor(private readonly reservasService: ReservasService) {}

  /**
   * Check-in: crea la estadía la primera vez que se hace check-in de esa
   * línea de reserva (no se crea al momento de reservar, ver CLAUDE.md 3.1
   * — reservas es la planificación, estadias es la ocupación real).
   */
  async checkin(
    client: SupabaseClient,
    hotelId: string,
    dto: CheckinDto,
    personalId: string,
  ) {
    const { data: rh, error: rhError } = await client
      .from('reserva_habitacion')
      .select(
        `
        id, habitacion_id, subtotal, tarifa_dia, dias, cargo_aforo_extra,
        cobro_early, cobro_late, reservas!inner(id, hotel_id, estado)
      `,
      )
      .eq('id', dto.reservaHabitacionId)
      .maybeSingle();

    if (rhError) throw rhError;
    const reserva = (rh as any)?.reservas;
    if (!rh || reserva.hotel_id !== hotelId) {
      throw new NotFoundException(
        'La línea de reserva no existe en este hotel',
      );
    }
    if (reserva.estado === 'cancelada') {
      throw new BadRequestException(
        'No se puede hacer check-in de una reserva cancelada',
      );
    }

    const { data: existente, error: existenteError } = await client
      .from('estadias')
      .select('id, estado_actual')
      .eq('reserva_habitacion_id', dto.reservaHabitacionId)
      .maybeSingle();

    if (existenteError) throw existenteError;
    if (existente && existente.estado_actual !== 'pendiente') {
      throw new ConflictException(
        `Esta habitación ya tiene un check-in registrado (estado: ${existente.estado_actual})`,
      );
    }

    const ahora = new Date().toISOString();
    let estadiaId: string;

    if (existente) {
      const { data: actualizada, error: updError } = await client
        .from('estadias')
        .update({ checkin_real: ahora, estado_actual: 'en_curso' })
        .eq('id', existente.id)
        .select('id')
        .single();
      if (updError) throw updError;
      estadiaId = actualizada.id;
    } else {
      const { data: creada, error: insError } = await client
        .from('estadias')
        .insert({
          reserva_habitacion_id: dto.reservaHabitacionId,
          checkin_real: ahora,
          estado_actual: 'en_curso',
          saldo: 0,
        })
        .select('id')
        .single();
      if (insError) throw insError;
      estadiaId = creada.id;
    }

    // Cargo inicial de alquiler (tarifa*días + aforo extra, sin early/late
    // para que cada tipo de cargo se vea aparte en el libro de movimientos).
    const rhData = rh as any;
    const cargoAlquiler =
      Number(rhData.tarifa_dia) * Number(rhData.dias) + Number(rhData.cargo_aforo_extra ?? 0);
    await this.insertarMovimiento(client, estadiaId, {
      tipo: 'alquiler',
      monto: cargoAlquiler,
      notas: 'Cargo inicial de alquiler al check-in',
    });

    const cobroEarly = Number(rhData.cobro_early ?? 0);
    if (cobroEarly > 0) {
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'early',
        monto: cobroEarly,
        notas: 'Ingreso antes de la hora de check-in',
      });
    }

    const { error: habError } = await client
      .from('habitaciones')
      .update({ estado: 'ocupada' })
      .eq('id', (rh as any).habitacion_id);
    if (habError) throw habError;

    return this.obtenerDetalle(client, hotelId, estadiaId);
  }

  /**
   * Checkout: cierra la estadía y dispara la limpieza profunda (CLAUDE.md
   * 3.2 — la habitación pasa a 'limpieza' y se encola una tarea de HK).
   * No bloquea por saldo pendiente: el hotel permite cobrar después
   * (ver hoja CuentasCobrar en la migración).
   */
  async checkout(
    client: SupabaseClient,
    hotelId: string,
    estadiaId: string,
    personalId: string,
    dto?: CheckoutDto,
  ) {
    const estadia = await this.cargarEstadiaHotel(client, hotelId, estadiaId);
    if (estadia.estado_actual !== 'en_curso') {
      throw new BadRequestException(
        `No se puede hacer checkout: la estadía está en estado '${estadia.estado_actual}'`,
      );
    }

    const ahora = new Date();
    const { error: updError } = await client
      .from('estadias')
      .update({ checkout_real: ahora.toISOString(), estado_actual: 'finalizada' })
      .eq('id', estadiaId);
    if (updError) throw updError;

    const habitacionId = estadia.reserva_habitacion.habitacion_id;

    const { error: habError } = await client
      .from('habitaciones')
      .update({ estado: 'limpieza' })
      .eq('id', habitacionId);
    if (habError) throw habError;

    const { error: tareaError } = await client.from('tareas_hk').insert({
      hotel_id: hotelId,
      habitacion_id: habitacionId,
      tipo: 'limpieza',
      estado: 'planificado',
      con_huesped_dentro: false,
      definido_por: personalId,
    });
    if (tareaError) throw tareaError;

    const cobroLate = await this.calcularCobroLate(
      client,
      hotelId,
      estadia,
      ahora,
      dto?.cobroLateManual,
    );
    if (cobroLate > 0) {
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'late',
        monto: cobroLate,
        notas: 'Salida después de la hora de check-out',
      });
    }

    return this.obtenerDetalle(client, hotelId, estadiaId);
  }

  /**
   * Check-in directo desde el panel de Habitaciones (link por habitación):
   * resuelve al huésped por documento, arma una reserva 'walkin' de 1
   * línea con el checkout previsto calculado según la configuración de
   * horas del hotel, y hace check-in inmediato. Reutiliza
   * ReservasService.crear() (misma validación de disponibilidad y cálculo
   * de subtotal que el resto del sistema) y this.checkin().
   */
  async checkinRapido(
    client: SupabaseClient,
    hotelId: string,
    dto: CheckinRapidoDto,
    personalId: string,
  ) {
    const { data: hab, error: habError } = await client
      .from('habitaciones')
      .select('id, estado')
      .eq('id', dto.habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (habError) throw habError;
    if (!hab) throw new NotFoundException('La habitación no existe en este hotel');
    if (hab.estado !== 'disponible') {
      throw new BadRequestException(
        `No se puede hacer check-in: la habitación está en estado '${hab.estado}'`,
      );
    }

    const huespedId = await this.resolverHuesped(client, hotelId, dto);
    const hotel = await this.obtenerConfigHotel(client, hotelId);
    const checkinDate = new Date(dto.checkinPrevisto);
    const checkoutPrevisto = this.calcularCheckoutPrevisto(checkinDate, dto.dias, hotel);
    const cobroEarly = this.calcularCobroEarly(
      checkinDate,
      dto.tarifaDia,
      hotel,
      dto.cobroEarlyManual,
    );

    const reservaDto: CrearReservaDto = {
      huespedId,
      origen: 'walkin',
      habitaciones: [
        {
          habitacionId: dto.habitacionId,
          nroPersonas: dto.nroPersonas,
          tipoAlquiler: 'pernocte',
          checkinPrevisto: checkinDate.toISOString(),
          checkoutPrevisto: checkoutPrevisto.toISOString(),
          tarifaDiaManual: dto.tarifaDia,
          diasManual: dto.dias,
          cobroEarly,
        },
      ],
    };

    const reserva = await this.reservasService.crear(client, hotelId, reservaDto, personalId);
    const reservaHabitacionId = (reserva as any).reserva_habitacion[0].id;

    return this.checkin(client, hotelId, { reservaHabitacionId }, personalId);
  }

  /**
   * Registra un cargo o abono en el libro único de movimientos_cuenta
   * (ver CLAUDE.md 3.3). 'pago' y 'consumo_bazar' pagado al momento generan
   * además un ingreso en la caja de la sesión de turno abierta del usuario.
   */
  async registrarMovimiento(
    client: SupabaseClient,
    hotelId: string,
    estadiaId: string,
    dto: RegistrarMovimientoDto,
    personalId: string,
  ) {
    const estadia = await this.cargarEstadiaHotel(client, hotelId, estadiaId);

    if (
      estadia.estado_actual === 'finalizada' &&
      dto.tipo !== 'pago' &&
      dto.tipo !== 'ajuste'
    ) {
      throw new BadRequestException(
        'La estadía ya finalizó; solo se pueden registrar pagos o ajustes de saldo pendiente.',
      );
    }

    if (dto.tipo === 'consumo_bazar' && !dto.productoId) {
      throw new BadRequestException('consumo_bazar requiere productoId');
    }
    if (dto.tipo !== 'ajuste' && dto.monto < 0) {
      throw new BadRequestException(
        'El monto debe ser un valor positivo; el signo se calcula según el tipo de movimiento',
      );
    }

    const montoFinal = dto.tipo === 'pago' ? -Math.abs(dto.monto) : dto.monto;
    const pagadoAlMomento =
      dto.tipo === 'consumo_bazar' ? (dto.pagadoAlMomento ?? true) : false;
    const generaCaja = dto.tipo === 'pago' || (dto.tipo === 'consumo_bazar' && pagadoAlMomento);

    let sesionTurnoId: string | undefined;
    if (generaCaja) {
      if (!dto.metodoPago) {
        throw new BadRequestException(
          'metodoPago es requerido para movimientos que generan ingreso de caja',
        );
      }
      sesionTurnoId = await this.obtenerSesionAbierta(client, hotelId, personalId);
    }

    await this.insertarMovimiento(client, estadiaId, {
      tipo: dto.tipo,
      monto: montoFinal,
      metodoPago: dto.metodoPago,
      productoId: dto.productoId,
      pagadoAlMomento,
      sesionTurnoId,
      notas: dto.notas,
    });

    if (generaCaja && sesionTurnoId) {
      const { error: cajaError } = await client.from('movimientos_caja').insert({
        sesion_turno_id: sesionTurnoId,
        tipo: 'ingreso',
        monto: Math.abs(dto.monto),
        concepto:
          dto.tipo === 'pago' ? 'Pago de huésped' : 'Consumo de bazar pagado al momento',
        metodo_pago: dto.metodoPago,
        notas: dto.notas ?? null,
      });
      if (cajaError) throw cajaError;
    }

    return this.obtenerDetalle(client, hotelId, estadiaId);
  }

  async listar(client: SupabaseClient, hotelId: string, filtros: ListarEstadiasQueryDto) {
    let query = client
      .from('reserva_habitacion')
      .select(
        `
        id, habitacion_id, tipo_alquiler,
        fecha_hora_checkin_prevista, fecha_hora_checkout_prevista,
        habitaciones(hab_numero, piso),
        reservas!inner(hotel_id, huespedes(nombres, apellidos)),
        estadias!inner(id, estado_actual, saldo, checkin_real, checkout_real)
      `,
      )
      .eq('reservas.hotel_id', hotelId);

    if (filtros.estado) {
      query = query.eq('estadias.estado_actual', filtros.estado);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async obtenerDetalle(client: SupabaseClient, hotelId: string, estadiaId: string) {
    const estadia = await this.cargarEstadiaHotel(client, hotelId, estadiaId);

    const { data: movimientos, error } = await client
      .from('movimientos_cuenta')
      .select('*')
      .eq('estadia_id', estadiaId)
      .order('fecha', { ascending: true });
    if (error) throw error;

    return { ...estadia, movimientos: movimientos ?? [] };
  }

  /**
   * Notas libres de recepción sobre el huésped actual (incidencias, hora
   * de desayuno, algo que se le prestó, etc). Vive en
   * reserva_habitacion.observaciones -- ya existía el campo, solo faltaba
   * un endpoint para editarlo desde el panel de habitaciones.
   */
  async actualizarNotas(
    client: SupabaseClient,
    hotelId: string,
    estadiaId: string,
    dto: ActualizarNotasDto,
  ) {
    const estadia = await this.cargarEstadiaHotel(client, hotelId, estadiaId);

    const { error } = await client
      .from('reserva_habitacion')
      .update({ observaciones: dto.notas })
      .eq('id', estadia.reserva_habitacion.id);
    if (error) throw error;

    return { ok: true };
  }

  private async cargarEstadiaHotel(
    client: SupabaseClient,
    hotelId: string,
    estadiaId: string,
  ): Promise<EstadiaConReserva> {
    const { data, error } = await client
      .from('estadias')
      .select(
        `
        id, estado_actual, saldo, checkin_real, checkout_real,
        reserva_habitacion!inner(
          id, habitacion_id, subtotal, tarifa_dia,
          habitaciones(hab_numero, piso),
          reservas!inner(hotel_id, estado, huespedes(nombres, apellidos))
        )
      `,
      )
      .eq('id', estadiaId)
      .maybeSingle();

    if (error) throw error;
    const data_ = data as unknown as EstadiaConReserva | null;
    if (!data_ || data_.reserva_habitacion.reservas.hotel_id !== hotelId) {
      throw new NotFoundException('Estadía no encontrada en este hotel');
    }
    return data_;
  }

  private async insertarMovimiento(
    client: SupabaseClient,
    estadiaId: string,
    input: {
      tipo: TipoMovimientoCuenta;
      monto: number;
      metodoPago?: MetodoPago;
      productoId?: string;
      pagadoAlMomento?: boolean;
      sesionTurnoId?: string;
      notas?: string;
    },
  ) {
    const { error: movError } = await client.from('movimientos_cuenta').insert({
      estadia_id: estadiaId,
      tipo: input.tipo,
      monto: input.monto,
      metodo_pago: input.metodoPago ?? null,
      producto_id: input.productoId ?? null,
      pagado_al_momento: input.pagadoAlMomento ?? true,
      sesion_turno_id: input.sesionTurnoId ?? null,
      notas: input.notas ?? null,
    });
    if (movError) throw movError;

    await this.recalcularSaldo(client, estadiaId);
  }

  private async recalcularSaldo(client: SupabaseClient, estadiaId: string) {
    const { data: movimientos, error } = await client
      .from('movimientos_cuenta')
      .select('monto')
      .eq('estadia_id', estadiaId);
    if (error) throw error;

    const saldo = (movimientos ?? []).reduce(
      (acc, m) => acc + Number(m.monto),
      0,
    );

    const { error: updError } = await client
      .from('estadias')
      .update({ saldo })
      .eq('id', estadiaId);
    if (updError) throw updError;
  }

  private async resolverHuesped(
    client: SupabaseClient,
    hotelId: string,
    dto: CheckinRapidoDto,
  ): Promise<string> {
    const { data: existente, error } = await client
      .from('huespedes')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('nro_doc', dto.nroDoc)
      .maybeSingle();
    if (error) throw error;
    if (existente) return existente.id;

    if (!dto.nombres || !dto.apellidos) {
      throw new BadRequestException(
        'El huésped no está registrado: nombres y apellidos son requeridos para crearlo',
      );
    }

    const { data: creado, error: insError } = await client
      .from('huespedes')
      .insert({
        hotel_id: hotelId,
        tipo_doc: dto.tipoDoc ?? 'dni',
        nro_doc: dto.nroDoc,
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        telefono: dto.telefono ?? null,
        correo: dto.correo ?? null,
        nacionalidad: dto.nacionalidad ?? null,
        fecha_nacimiento: dto.fechaNacimiento ?? null,
      })
      .select('id')
      .single();
    if (insError) throw insError;
    return creado.id;
  }

  private async obtenerConfigHotel(client: SupabaseClient, hotelId: string): Promise<HotelHoras> {
    const { data, error } = await client
      .from('hoteles')
      .select('hora_checkin, hora_checkout, modo_24h')
      .eq('id', hotelId)
      .single();
    if (error) throw error;
    return data as HotelHoras;
  }

  private calcularCheckoutPrevisto(checkinDate: Date, dias: number, hotel: HotelHoras): Date {
    if (hotel.modo_24h) {
      return new Date(checkinDate.getTime() + dias * 24 * 60 * 60 * 1000);
    }
    const [hh, mm] = hotel.hora_checkout.split(':').map(Number);
    const salidaLima = comoRelojLima(checkinDate);
    salidaLima.setUTCDate(salidaLima.getUTCDate() + dias);
    salidaLima.setUTCHours(hh, mm, 0, 0);
    return desdeRelojLima(salidaLima);
  }

  private calcularCobroEarly(
    checkinDate: Date,
    tarifaDia: number,
    hotel: HotelHoras,
    cobroEarlyManual?: number,
  ): number {
    if (cobroEarlyManual !== undefined) return cobroEarlyManual;
    if (hotel.modo_24h) return 0;

    const [hh, mm] = hotel.hora_checkin.split(':').map(Number);
    const relojLima = comoRelojLima(checkinDate);
    const horaOficialLima = new Date(relojLima);
    horaOficialLima.setUTCHours(hh, mm, 0, 0);

    if (relojLima >= horaOficialLima) return 0;
    return tarifaDia * 0.5;
  }

  private async calcularCobroLate(
    client: SupabaseClient,
    hotelId: string,
    estadia: EstadiaConReserva,
    ahora: Date,
    cobroLateManual?: number,
  ): Promise<number> {
    if (cobroLateManual !== undefined) return cobroLateManual;

    const hotel = await this.obtenerConfigHotel(client, hotelId);
    if (hotel.modo_24h) return 0;

    const [hh, mm] = hotel.hora_checkout.split(':').map(Number);
    const relojLima = comoRelojLima(ahora);
    const horaLimiteLima = new Date(relojLima);
    horaLimiteLima.setUTCHours(hh, mm, 0, 0);

    if (relojLima <= horaLimiteLima) return 0;
    return Number(estadia.reserva_habitacion.tarifa_dia) * 0.5;
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
        'No tienes una sesión de turno abierta en este hotel; ábrela antes de registrar cobros.',
      );
    }
    return sesion.id;
  }
}
