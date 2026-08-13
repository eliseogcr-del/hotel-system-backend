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
import { ActualizarEstadiaDto } from './dto/actualizar-estadia.dto';
import { ReservasService } from '../reservas/reservas.service';
import { CrearReservaDto } from '../reservas/dto/crear-reserva.dto';
import { TipoCambioService } from '../tipo-cambio/tipo-cambio.service';

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
    cochera_id: string | null;
    habitaciones: { hab_numero: number; piso: number } | null;
    reservas: {
      hotel_id: string;
      estado: string;
      huesped_id: string;
      huespedes: {
        nombres: string;
        apellidos: string;
        tipo_doc: string;
        nro_doc: string;
        telefono: string | null;
        correo: string | null;
      } | null;
    };
    vehiculos: { id: string; marca: string | null; tipo: string | null; placa: string | null } | null;
  };
}

@Injectable()
export class EstadiasService {
  constructor(
    private readonly reservasService: ReservasService,
    private readonly tipoCambioService: TipoCambioService,
  ) {}

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
        cobro_early, cobro_late, cobro_mascota,
        reservas!inner(id, hotel_id, estado, anticipo_monto, anticipo_vinculado_estadia_id)
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
      registradoPor: personalId,
    });

    const cobroEarly = Number(rhData.cobro_early ?? 0);
    if (cobroEarly > 0) {
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'early',
        monto: cobroEarly,
        notas: 'Ingreso antes de la hora de check-in',
        registradoPor: personalId,
      });
    }

    const cobroMascota = Number(rhData.cobro_mascota ?? 0);
    if (cobroMascota > 0) {
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'mascota',
        monto: cobroMascota,
        notas: 'Cargo por mascota',
        registradoPor: personalId,
      });
    }

    // Si la reserva traía un anticipo (pago adelantado, ver
    // ReservasService.procesarAnticipo()), se enlaza recién ahora como un
    // 'pago' que reduce el saldo de la estadía real. No genera un segundo
    // ingreso de caja: si el anticipo fue en efectivo, ya se contó en la
    // caja de quien lo tomó en su momento; si fue yape/tarjeta/
    // transferencia, nunca tocó ninguna caja (va directo a la cuenta de
    // la empresa), igual que cualquier otro pago con esos métodos.
    const reservaData = rhData.reservas;
    const anticipoMonto = Number(reservaData?.anticipo_monto ?? 0);
    if (anticipoMonto > 0 && !reservaData.anticipo_vinculado_estadia_id) {
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'pago',
        monto: -anticipoMonto,
        notas: 'Anticipo de la reserva',
        registradoPor: personalId,
      });
      const { error: anticipoError } = await client
        .from('reservas')
        .update({ anticipo_vinculado_estadia_id: estadiaId })
        .eq('id', reservaData.id);
      if (anticipoError) throw anticipoError;
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

    const ahora = dto?.checkoutReal ? new Date(dto.checkoutReal) : new Date();
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

    // La cochera es parte de la estadía igual que la habitación: si el
    // huésped tenía una asignada, se libera al hacer checkout.
    if (estadia.reserva_habitacion.cochera_id) {
      const { error: cocheraError } = await client
        .from('cocheras')
        .update({ estado: 'disponible' })
        .eq('id', estadia.reserva_habitacion.cochera_id);
      if (cocheraError) throw cocheraError;
    }

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
        registradoPor: personalId,
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
          incluyeDesayuno: dto.incluyeDesayuno,
          cocheraId: dto.cocheraId,
          vehiculoMarca: dto.vehiculoMarca,
          vehiculoTipo: dto.vehiculoTipo,
          vehiculoPlaca: dto.vehiculoPlaca,
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
    if (dto.tipo === 'desayuno' && !dto.tipoDesayunoId) {
      throw new BadRequestException('desayuno requiere tipoDesayunoId');
    }
    if (dto.tipo !== 'ajuste' && dto.monto < 0) {
      throw new BadRequestException(
        'El monto debe ser un valor positivo; el signo se calcula según el tipo de movimiento',
      );
    }

    // Pago en dólares: el monto que llega en dto.monto está en USD -- se
    // convierte a soles con el tipo de cambio (compra, porque el hotel
    // está recibiendo dólares del huésped) vigente antes de tocar el
    // saldo/caja, que siempre quedan en una sola moneda (soles).
    let montoPago = dto.monto;
    let monedaPago: 'PEN' | 'USD' | undefined;
    let montoOriginalUsd: number | undefined;
    let tipoCambioAplicado: number | undefined;
    if (dto.tipo === 'pago' && dto.moneda === 'USD') {
      const tc = await this.tipoCambioService.obtenerVigente(client);
      if (!tc) {
        throw new BadRequestException(
          'No hay un tipo de cambio configurado; el administrador debe ingresarlo en Configuración → Tipo de cambio antes de registrar pagos en dólares.',
        );
      }
      monedaPago = 'USD';
      montoOriginalUsd = dto.monto;
      tipoCambioAplicado = Number(tc.valor_compra);
      montoPago = Number((dto.monto * tipoCambioAplicado).toFixed(2));
    }

    // Un pago no puede dejar el saldo en negativo (el huésped pagando de más
    // sin que exista esa deuda). Si de verdad pagó de más y hay que
    // devolverle algo, eso se resuelve con un 'ajuste', no fingiendo que
    // debía más de lo que realmente debía.
    if (dto.tipo === 'pago' && montoPago > Number(estadia.saldo) + 0.01) {
      throw new BadRequestException(
        `El pago (S/. ${montoPago.toFixed(2)}) no puede ser mayor que la deuda actual (S/. ${Number(estadia.saldo).toFixed(2)})`,
      );
    }

    const esVentaConCatalogo = dto.tipo === 'consumo_bazar' || dto.tipo === 'desayuno';
    const montoFinal = dto.tipo === 'pago' ? -Math.abs(montoPago) : montoPago;
    const pagadoAlMomento = esVentaConCatalogo ? (dto.pagadoAlMomento ?? true) : false;
    const generaCaja = dto.tipo === 'pago' || (esVentaConCatalogo && pagadoAlMomento);

    let sesionTurnoId: string | undefined;
    if (generaCaja) {
      if (!dto.metodoPago) {
        throw new BadRequestException(
          'metodoPago es requerido para movimientos que generan ingreso de caja',
        );
      }
      sesionTurnoId = await this.obtenerSesionAbierta(client, hotelId, personalId);
    }

    // Para consumo_bazar y desayuno, las notas se arman con el nombre del
    // producto/tipo (y la cantidad si es más de 1) en vez de depender de que
    // el personal lo tipee, así queda visible en el libro qué se vendió.
    let notasCargo = dto.notas;
    if (esVentaConCatalogo) {
      const tabla = dto.tipo === 'consumo_bazar' ? 'productos_bazar' : 'tipos_desayuno';
      const id = dto.tipo === 'consumo_bazar' ? dto.productoId : dto.tipoDesayunoId;
      const { data: item, error: itemError } = await client
        .from(tabla)
        .select('nombre')
        .eq('id', id)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!item) {
        throw new NotFoundException(
          dto.tipo === 'consumo_bazar' ? 'Producto de bazar no encontrado' : 'Tipo de desayuno no encontrado',
        );
      }

      const cantidad = dto.cantidad ?? 1;
      const descripcion = `${item.nombre}${cantidad > 1 ? ` x${cantidad}` : ''}`;
      notasCargo = dto.notas ? `${descripcion} — ${dto.notas}` : descripcion;
    }
    if (monedaPago === 'USD') {
      const refUsd = `Pago en USD $${montoOriginalUsd!.toFixed(2)} al T.C. compra ${tipoCambioAplicado!.toFixed(3)} = S/. ${montoPago.toFixed(2)}`;
      notasCargo = dto.notas ? `${refUsd} — ${dto.notas}` : refUsd;
    }

    await this.insertarMovimiento(client, estadiaId, {
      tipo: dto.tipo,
      monto: montoFinal,
      metodoPago: dto.metodoPago,
      productoId: dto.productoId,
      tipoDesayunoId: dto.tipoDesayunoId,
      pagadoAlMomento,
      sesionTurnoId,
      notas: notasCargo,
      registradoPor: personalId,
      monedaPago,
      montoOriginal: montoOriginalUsd,
      tipoCambioAplicado,
    });

    // La venta con catálogo (bazar/desayuno) pagada al momento genera además
    // el pago que compensa esa deuda en el libro de la estadía (antes solo
    // se registraba el ingreso en caja y el cargo quedaba como pendiente).
    if (esVentaConCatalogo && pagadoAlMomento) {
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'pago',
        monto: -Math.abs(dto.monto),
        metodoPago: dto.metodoPago,
        registradoPor: personalId,
        notas: `Pago: ${notasCargo}`,
      });
    }

    if (generaCaja && sesionTurnoId) {
      const conceptoCaja =
        dto.tipo === 'pago'
          ? 'Pago de huésped'
          : dto.tipo === 'desayuno'
            ? 'Desayuno pagado al momento'
            : 'Consumo de bazar pagado al momento';
      const { error: cajaError } = await client.from('movimientos_caja').insert({
        sesion_turno_id: sesionTurnoId,
        tipo: 'ingreso',
        monto: Math.abs(montoPago),
        concepto: conceptoCaja,
        metodo_pago: dto.metodoPago,
        notas: notasCargo ?? null,
        moneda_pago: monedaPago ?? null,
        monto_original: montoOriginalUsd ?? null,
        tipo_cambio_aplicado: tipoCambioAplicado ?? null,
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
      .select('*, personal(nombre)')
      .eq('estadia_id', estadiaId)
      .order('fecha', { ascending: true });
    if (error) throw error;

    return { ...estadia, movimientos: movimientos ?? [] };
  }

  /**
   * Anula un cargo (cuenta por cobrar) ya registrado: pone su monto en 0 y
   * deja constancia en notas de quién lo anuló, sin borrar el registro (se
   * conserva el histórico de qué se cobró originalmente). Excepción
   * deliberada al principio de "nunca editar movimientos ya posteados" de
   * este libro (ver `actualizar()`/CLAUDE.md): ahí se pidió explícitamente
   * poder anular en la misma fila, no agregar un movimiento compensatorio.
   * Solo aplica a cargos (monto > 0); los pagos (monto < 0) no se anulan
   * por aquí porque eso resucitaría una deuda ya saldada -- si un pago se
   * registró mal, se corrige con un 'ajuste'.
   */
  async anularMovimiento(
    client: SupabaseClient,
    hotelId: string,
    estadiaId: string,
    movimientoId: string,
    personalId: string,
  ) {
    await this.cargarEstadiaHotel(client, hotelId, estadiaId);

    const { data: movimiento, error: movError } = await client
      .from('movimientos_cuenta')
      .select('id, monto, notas')
      .eq('id', movimientoId)
      .eq('estadia_id', estadiaId)
      .maybeSingle();
    if (movError) throw movError;
    if (!movimiento) {
      throw new NotFoundException('Movimiento no encontrado en esta estadía');
    }
    if (Number(movimiento.monto) <= 0) {
      throw new BadRequestException(
        'Solo se pueden anular cargos (cuentas por cobrar); este movimiento ya está anulado o es un pago',
      );
    }

    const { data: personal, error: personalError } = await client
      .from('personal')
      .select('nombre')
      .eq('id', personalId)
      .maybeSingle();
    if (personalError) throw personalError;
    const nombreAnulador = personal?.nombre ?? 'usuario desconocido';

    const notasNuevas = movimiento.notas
      ? `${movimiento.notas} — Anulado por ${nombreAnulador}`
      : `Anulado por ${nombreAnulador}`;

    const { error: updError } = await client
      .from('movimientos_cuenta')
      .update({ monto: 0, notas: notasNuevas })
      .eq('id', movimientoId);
    if (updError) throw updError;

    await this.recalcularSaldo(client, estadiaId);

    return this.obtenerDetalle(client, hotelId, estadiaId);
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

  /**
   * Editar una estadía en curso desde su detalle: cambiar la tarifa diaria
   * (rige hacia adelante, ej. para el cálculo de late; no toca cargos ya
   * registrados) y/o agregar días (extiende fecha_hora_checkout_prevista y
   * genera el cargo de alquiler de esos días nuevos como un movimiento
   * aparte, igual que cualquier otro cargo del libro); también asignar o
   * quitar la cochera del huésped (la cochera nueva debe estar 'disponible',
   * y la anterior queda 'disponible' de nuevo) y guardar los datos de su
   * vehículo (marca/tipo/placa). No genera ningún cargo automático por la
   * cochera -- si es externa/paga, se registra igual que cualquier otro
   * servicio con el tipo 'cochera' del formulario de movimientos.
   */
  async actualizar(
    client: SupabaseClient,
    hotelId: string,
    estadiaId: string,
    dto: ActualizarEstadiaDto,
    personalId: string,
  ) {
    if (
      dto.tarifaDiaNueva === undefined &&
      dto.diasAdicionales === undefined &&
      dto.cocheraId === undefined &&
      !dto.quitarCochera &&
      dto.vehiculoMarca === undefined &&
      dto.vehiculoTipo === undefined &&
      dto.vehiculoPlaca === undefined
    ) {
      throw new BadRequestException('No se enviaron cambios');
    }

    const estadia = await this.cargarEstadiaHotel(client, hotelId, estadiaId);
    if (estadia.estado_actual !== 'en_curso') {
      throw new BadRequestException(
        `No se puede editar: la estadía está en estado '${estadia.estado_actual}'`,
      );
    }

    const tarifaFinal = dto.tarifaDiaNueva ?? Number(estadia.reserva_habitacion.tarifa_dia);

    if (dto.tarifaDiaNueva !== undefined) {
      const precioCosto = await this.obtenerPrecioCosto(
        client,
        estadia.reserva_habitacion.habitacion_id,
      );
      if (precioCosto > 0 && dto.tarifaDiaNueva < precioCosto) {
        throw new BadRequestException(
          `La tarifa (S/. ${dto.tarifaDiaNueva}) no puede ser menor al precio de costo configurado para este tipo de habitación (S/. ${precioCosto})`,
        );
      }
    }

    const cambiosLinea: Record<string, unknown> = {};
    if (dto.tarifaDiaNueva !== undefined) cambiosLinea.tarifa_dia = dto.tarifaDiaNueva;

    if (dto.diasAdicionales) {
      const { data: rhActual, error: rhError } = await client
        .from('reserva_habitacion')
        .select('dias, fecha_hora_checkout_prevista')
        .eq('id', estadia.reserva_habitacion.id)
        .single();
      if (rhError) throw rhError;

      cambiosLinea.dias = Number(rhActual.dias) + dto.diasAdicionales;
      const nuevoCheckout = new Date(
        new Date(rhActual.fecha_hora_checkout_prevista).getTime() +
          dto.diasAdicionales * 24 * 60 * 60 * 1000,
      );
      cambiosLinea.fecha_hora_checkout_prevista = nuevoCheckout.toISOString();
    }

    const cocheraActualId = estadia.reserva_habitacion.cochera_id;

    if (dto.quitarCochera) {
      if (cocheraActualId) {
        const { error } = await client
          .from('cocheras')
          .update({ estado: 'disponible' })
          .eq('id', cocheraActualId);
        if (error) throw error;
      }
      cambiosLinea.cochera_id = null;
    } else if (dto.cocheraId !== undefined && dto.cocheraId !== cocheraActualId) {
      const { data: cocheraNueva, error: cocheraError } = await client
        .from('cocheras')
        .select('id, estado, hotel_id')
        .eq('id', dto.cocheraId)
        .maybeSingle();
      if (cocheraError) throw cocheraError;
      if (!cocheraNueva || cocheraNueva.hotel_id !== hotelId) {
        throw new NotFoundException('Cochera no encontrada en este hotel');
      }
      if (cocheraNueva.estado !== 'disponible') {
        throw new BadRequestException('Esa cochera ya está ocupada');
      }

      if (cocheraActualId) {
        const { error } = await client
          .from('cocheras')
          .update({ estado: 'disponible' })
          .eq('id', cocheraActualId);
        if (error) throw error;
      }
      const { error: ocuparError } = await client
        .from('cocheras')
        .update({ estado: 'ocupada' })
        .eq('id', dto.cocheraId);
      if (ocuparError) throw ocuparError;

      cambiosLinea.cochera_id = dto.cocheraId;
    }

    if (Object.keys(cambiosLinea).length > 0) {
      const { error: updError } = await client
        .from('reserva_habitacion')
        .update(cambiosLinea)
        .eq('id', estadia.reserva_habitacion.id);
      if (updError) throw updError;
    }

    if (dto.diasAdicionales) {
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'alquiler',
        monto: tarifaFinal * dto.diasAdicionales,
        notas: `Extensión de estadía: +${dto.diasAdicionales} día(s)`,
        registradoPor: personalId,
      });
    }

    // Los datos del vehículo son independientes de la cochera (se pueden
    // guardar placa/marca antes de que haya una cochera libre para asignar).
    if (dto.vehiculoMarca !== undefined || dto.vehiculoTipo !== undefined || dto.vehiculoPlaca !== undefined) {
      const vehiculoExistente = estadia.reserva_habitacion.vehiculos;
      const datosVehiculo = {
        marca: dto.vehiculoMarca ?? vehiculoExistente?.marca ?? null,
        tipo: dto.vehiculoTipo ?? vehiculoExistente?.tipo ?? null,
        placa: dto.vehiculoPlaca ?? vehiculoExistente?.placa ?? null,
      };
      if (vehiculoExistente) {
        const { error: vehError } = await client
          .from('vehiculos')
          .update(datosVehiculo)
          .eq('id', vehiculoExistente.id);
        if (vehError) throw vehError;
      } else {
        const { error: vehError } = await client
          .from('vehiculos')
          .insert({ reserva_habitacion_id: estadia.reserva_habitacion.id, ...datosVehiculo });
        if (vehError) throw vehError;
      }
    }

    return this.obtenerDetalle(client, hotelId, estadiaId);
  }

  /**
   * Huéspedes que no avisan que se quedan más días: si ya pasó más de 1 hora
   * desde la salida programada de una estadía 'en_curso' (solo pernocte; una
   * reserva por horas no tiene sentido "extenderla un día"), se asume que
   * sigue ocupada y el sistema mismo extiende la salida un día más y cobra
   * la tarifa de ese día -- mismo mecanismo que "días adicionales" en
   * actualizar(), pero sin personal detrás (registrado_por queda null) y con
   * una nota que deja claro que fue automático, no que lo pidió recepción.
   *
   * No hay un cron real corriendo en el backend (Render free tier se
   * duerme); esto se dispara desde el frontend cada vez que se carga/
   * recarga el panel de Habitaciones, así que en la práctica corre cada vez
   * que alguien mira esa pantalla -- que es el uso normal de recepción.
   */
  async procesarSalidasVencidas(client: SupabaseClient, hotelId: string) {
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: vencidas, error } = await client
      .from('reserva_habitacion')
      .select(
        `
        id, tarifa_dia, dias, fecha_hora_checkout_prevista, tipo_alquiler,
        reservas!inner(hotel_id),
        estadias!inner(id, estado_actual)
      `,
      )
      .eq('reservas.hotel_id', hotelId)
      .eq('estadias.estado_actual', 'en_curso')
      .eq('tipo_alquiler', 'pernocte')
      .lt('fecha_hora_checkout_prevista', haceUnaHora);
    if (error) throw error;

    const extendidas: string[] = [];
    for (const linea of (vencidas ?? []) as any[]) {
      const nuevoCheckout = new Date(
        new Date(linea.fecha_hora_checkout_prevista).getTime() + 24 * 60 * 60 * 1000,
      );

      const { error: updError } = await client
        .from('reserva_habitacion')
        .update({
          dias: Number(linea.dias) + 1,
          fecha_hora_checkout_prevista: nuevoCheckout.toISOString(),
        })
        .eq('id', linea.id);
      if (updError) throw updError;

      const estadiaId = linea.estadias.id;
      await this.insertarMovimiento(client, estadiaId, {
        tipo: 'alquiler',
        monto: Number(linea.tarifa_dia),
        notas: 'Extensión automática: no se registró checkout ni ampliación a la hora de salida programada (+1 día)',
      });

      extendidas.push(estadiaId);
    }

    return { extendidas: extendidas.length };
  }

  private async obtenerPrecioCosto(client: SupabaseClient, habitacionId: string): Promise<number> {
    const { data, error } = await client
      .from('habitaciones')
      .select('tipos_habitacion(precio_costo)')
      .eq('id', habitacionId)
      .maybeSingle();
    if (error) throw error;
    return Number((data as any)?.tipos_habitacion?.precio_costo ?? 0);
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
          id, habitacion_id, subtotal, tarifa_dia, cochera_id,
          habitaciones(hab_numero, piso),
          reservas!inner(
            hotel_id, estado, huesped_id,
            huespedes(nombres, apellidos, tipo_doc, nro_doc, telefono, correo)
          ),
          vehiculos(id, marca, tipo, placa)
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
      tipoDesayunoId?: string;
      pagadoAlMomento?: boolean;
      sesionTurnoId?: string;
      notas?: string;
      registradoPor?: string;
      monedaPago?: 'PEN' | 'USD';
      montoOriginal?: number;
      tipoCambioAplicado?: number;
    },
  ) {
    const { error: movError } = await client.from('movimientos_cuenta').insert({
      estadia_id: estadiaId,
      tipo: input.tipo,
      monto: input.monto,
      metodo_pago: input.metodoPago ?? null,
      producto_id: input.productoId ?? null,
      tipo_desayuno_id: input.tipoDesayunoId ?? null,
      pagado_al_momento: input.pagadoAlMomento ?? true,
      sesion_turno_id: input.sesionTurnoId ?? null,
      notas: input.notas ?? null,
      registrado_por: input.registradoPor ?? null,
      moneda_pago: input.monedaPago ?? null,
      monto_original: input.montoOriginal ?? null,
      tipo_cambio_aplicado: input.tipoCambioAplicado ?? null,
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
        origen: dto.origen ?? null,
        fecha_nacimiento: dto.fechaNacimiento ?? null,
        ruc: dto.ruc ?? null,
        razon_social: dto.razonSocial ?? null,
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
