import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CheckinDto } from './dto/checkin.dto';
import {
  RegistrarMovimientoDto,
  TipoMovimientoCuenta,
  MetodoPago,
} from './dto/registrar-movimiento.dto';
import { ListarEstadiasQueryDto } from './dto/listar-estadias-query.dto';

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
        'id, habitacion_id, subtotal, reservas!inner(id, hotel_id, estado)',
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

    // Cargo inicial de alquiler, tomado del subtotal ya calculado al reservar.
    await this.insertarMovimiento(client, estadiaId, {
      tipo: 'alquiler',
      monto: (rh as any).subtotal,
      notas: 'Cargo inicial de alquiler al check-in',
    });

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
  ) {
    const estadia = await this.cargarEstadiaHotel(client, hotelId, estadiaId);
    if (estadia.estado_actual !== 'en_curso') {
      throw new BadRequestException(
        `No se puede hacer checkout: la estadía está en estado '${estadia.estado_actual}'`,
      );
    }

    const { error: updError } = await client
      .from('estadias')
      .update({ checkout_real: new Date().toISOString(), estado_actual: 'finalizada' })
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

    return this.obtenerDetalle(client, hotelId, estadiaId);
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
          id, habitacion_id, subtotal,
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
