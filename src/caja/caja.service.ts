import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AbrirTurnoDto } from './dto/abrir-turno.dto';
import { RegistrarMovimientoCajaDto } from './dto/registrar-movimiento-caja.dto';
import { EditarMovimientoCajaDto } from './dto/editar-movimiento-caja.dto';

interface SesionConHotel {
  id: string;
  personal_hotel_id: string;
  turno_id: string;
  fecha: string;
  saldo_inicial: number;
  saldo_final: number | null;
  estado: 'abierta' | 'cerrada';
  abierta_en: string;
  cerrada_en: string | null;
  cerrada_automaticamente: boolean;
  personal_hotel: { hotel_id: string };
  turnos: { nombre: string; hora_inicio: string; hora_fin: string } | null;
}

// Mismo criterio de zona horaria que estadias.service.ts: el servidor
// (Render) no corre necesariamente en hora de Lima, así que para comparar
// contra hora_fin del turno (que sí es hora de Lima) hay que traducir el
// instante real a "reloj de pared de Lima" explícitamente.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function comoRelojLima(fecha: Date): Date {
  return new Date(fecha.getTime() - PERU_UTC_OFFSET_MS);
}

// Cuántos minutos antes de que termine el turno se avisa al recepcionista
// que debe cerrar su caja. Es solo un recordatorio -- cada recepcionista
// es autónoma para decidir cuándo cerrar su turno, el sistema ya no la
// cierra sola por vencimiento (ver obtenerEstadoTurno()); lo que sí se
// cierra sola es la caja al hacer logout sin haberla cerrado a mano, ver
// el botón "Cerrar sesión" del frontend (Layout.tsx).
const AVISO_CIERRE_MINUTOS_ANTES = 10;

@Injectable()
export class CajaService {
  constructor(private readonly supabase: SupabaseService) {}

  async listarTurnos(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('turnos')
      .select('id, nombre, hora_inicio, hora_fin')
      .eq('hotel_id', hotelId)
      .eq('activo', true)
      .order('hora_inicio', { ascending: true });
    if (error) throw error;
    return data;
  }

  async abrirTurno(
    client: SupabaseClient,
    hotelId: string,
    dto: AbrirTurnoDto,
    personalId: string,
  ) {
    const personalHotel = await this.cargarPersonalHotel(client, hotelId, personalId);

    const { data: yaAbierta, error: yaAbiertaError } = await client
      .from('sesiones_turno')
      .select('id')
      .eq('personal_hotel_id', personalHotel.id)
      .eq('estado', 'abierta')
      .maybeSingle();
    if (yaAbiertaError) throw yaAbiertaError;
    if (yaAbierta) {
      throw new ConflictException(
        'Ya tienes una sesión de turno abierta en este hotel; ciérrala antes de abrir otra.',
      );
    }

    const { data: turno, error: turnoError } = await client
      .from('turnos')
      .select('id, nombre, hora_inicio, hora_fin')
      .eq('id', dto.turnoId)
      .eq('hotel_id', hotelId)
      .eq('activo', true)
      .maybeSingle();
    if (turnoError) throw turnoError;
    if (!turno) {
      throw new NotFoundException('El turno no existe o no está activo en este hotel');
    }

    // No se puede abrir un turno fuera de su propio horario (ej. abrir
    // "Tarde" a las 10am si dice 15:00-21:00) -- cada turno solo se puede
    // abrir mientras la hora actual cae dentro de su rango.
    if (!this.estaEnHorarioDelTurno(turno.hora_inicio, turno.hora_fin)) {
      throw new BadRequestException(
        `No puedes abrir el turno '${turno.nombre}' (${turno.hora_inicio.slice(0, 5)}–${turno.hora_fin.slice(0, 5)}) fuera de su horario; ahora mismo son las ${this.horaActualLimaTexto()}.`,
      );
    }

    // Herencia de saldo entre sesiones (CLAUDE.md 3.4): el saldo pasa de una
    // caja a la siguiente aunque las trabajen recepcionistas distintos, pero
    // cada quien solo ve sus propios movimientos (RLS restringe
    // sesiones_turno a "mis sesiones" para un no-admin). Por eso esta
    // lectura del saldo_final del cierre anterior, y la de abajo que revisa
    // si ALGUIEN MÁS ya tiene este mismo turno abierto, se hacen con el
    // cliente de servicio (salta RLS) -- de la sesión ajena solo se expone
    // el nombre de quien la tiene abierta, a propósito, para el mensaje.
    const service = this.supabase.getServiceClient();

    const { data: otraAbierta, error: otraAbiertaError } = await service
      .from('sesiones_turno')
      .select('id, personal_hotel(personal(nombre))')
      .eq('turno_id', dto.turnoId)
      .eq('estado', 'abierta')
      .maybeSingle();
    if (otraAbiertaError) throw otraAbiertaError;
    if (otraAbierta) {
      const nombreOtro =
        (otraAbierta as any).personal_hotel?.personal?.nombre ?? 'otro colaborador';
      throw new ConflictException(
        `Ya hay una sesión abierta en el turno '${turno.nombre}' con ${nombreOtro}. Debe cerrar su sesión antes de que puedas abrir este turno.`,
      );
    }

    const { data: anterior, error: anteriorError } = await service
      .from('sesiones_turno')
      .select('id, saldo_final, personal_hotel!inner(hotel_id)')
      .eq('personal_hotel.hotel_id', hotelId)
      .eq('estado', 'cerrada')
      .order('cerrada_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anteriorError) throw anteriorError;

    // Si nunca hubo una sesión cerrada antes (arranque en producción, sin
    // historial migrado), el saldo inicial sale del que el admin configuró
    // una sola vez en Configuración (ver ConfiguracionService.actualizarHotel,
    // que bloquea ese campo en cuanto exista alguna sesiones_turno).
    let saldoInicial = anterior?.saldo_final;
    if (saldoInicial === undefined) {
      const { data: hotel, error: hotelError } = await service
        .from('hoteles')
        .select('saldo_inicial_caja')
        .eq('id', hotelId)
        .maybeSingle();
      if (hotelError) throw hotelError;
      saldoInicial = Number(hotel?.saldo_inicial_caja ?? 0);
    }

    const { data: creada, error: insError } = await client
      .from('sesiones_turno')
      .insert({
        personal_hotel_id: personalHotel.id,
        turno_id: dto.turnoId,
        sesion_anterior_id: anterior?.id ?? null,
        fecha: this.fechaHoyLima(),
        saldo_inicial: saldoInicial,
        estado: 'abierta',
      })
      .select('id')
      .single();
    if (insError) throw insError;

    return this.obtenerDetalle(client, hotelId, creada.id);
  }

  async cerrarTurno(
    client: SupabaseClient,
    hotelId: string,
    sesionId: string,
    personalId: string,
  ) {
    const sesion = await this.cargarSesionHotel(client, hotelId, sesionId);
    const personalHotel = await this.cargarPersonalHotel(client, hotelId, personalId);

    if (sesion.personal_hotel_id !== personalHotel.id) {
      throw new ForbiddenException('Solo puedes cerrar tus propias sesiones de turno');
    }
    if (sesion.estado !== 'abierta') {
      throw new BadRequestException('Esta sesión ya está cerrada');
    }

    // El saldo que se traspasa entre turnos es SOLO el efectivo físico que
    // el recepcionista tiene y entrega en mano: Yape/transferencia/tarjeta
    // van directo a la cuenta de la empresa, a la que el recepcionista no
    // tiene acceso, así que ese dinero nunca pasa por su caja.
    const { totalIngresosEfectivo, totalEgresosEfectivo } = await this.sumarMovimientos(client, sesionId);
    const saldoFinal = Number(sesion.saldo_inicial) + totalIngresosEfectivo - totalEgresosEfectivo;

    const { error: updError } = await client
      .from('sesiones_turno')
      .update({
        estado: 'cerrada',
        saldo_final: saldoFinal,
        cerrada_en: new Date().toISOString(),
      })
      .eq('id', sesionId);
    if (updError) throw updError;

    return this.obtenerDetalle(client, hotelId, sesionId);
  }

  async registrarMovimiento(
    client: SupabaseClient,
    hotelId: string,
    sesionId: string,
    dto: RegistrarMovimientoCajaDto,
    personalId: string,
  ) {
    const sesion = await this.cargarSesionHotel(client, hotelId, sesionId);
    const personalHotel = await this.cargarPersonalHotel(client, hotelId, personalId);

    if (sesion.personal_hotel_id !== personalHotel.id) {
      throw new ForbiddenException(
        'Solo puedes registrar movimientos en tus propias sesiones de turno',
      );
    }
    if (sesion.estado !== 'abierta') {
      throw new BadRequestException('No se pueden registrar movimientos en una sesión cerrada');
    }

    const { error } = await client.from('movimientos_caja').insert({
      sesion_turno_id: sesionId,
      tipo: dto.tipo,
      monto: dto.monto,
      concepto: dto.concepto,
      metodo_pago: dto.metodoPago ?? 'efectivo',
      notas: dto.notas ?? null,
    });
    if (error) throw error;

    return this.obtenerDetalle(client, hotelId, sesionId);
  }

  /**
   * Solo admin: corrige el monto de un ingreso/egreso de caja de CUALQUIER
   * sesión (no solo la propia), a diferencia de registrarMovimiento() que
   * solo deja tocar la sesión de uno mismo mientras está abierta. Deja
   * constancia en notas de quién lo modificó, el monto anterior y cuándo.
   * `movimientos_caja` no tiene policy de UPDATE (solo select/insert) y
   * `sesiones_turno` solo permite UPDATE al dueño de la sesión -- por eso
   * el ajuste en sí se hace con el cliente de servicio, a propósito: el
   * controller ya exige rol admin antes de llegar aquí.
   */
  async editarMovimiento(
    client: SupabaseClient,
    hotelId: string,
    sesionId: string,
    movimientoId: string,
    dto: EditarMovimientoCajaDto,
    personalId: string,
  ) {
    const sesion = await this.cargarSesionHotel(client, hotelId, sesionId);

    const { data: movimiento, error: movError } = await client
      .from('movimientos_caja')
      .select('id, monto, notas')
      .eq('id', movimientoId)
      .eq('sesion_turno_id', sesionId)
      .maybeSingle();
    if (movError) throw movError;
    if (!movimiento) {
      throw new NotFoundException('Movimiento no encontrado en esta sesión');
    }

    const { data: personal, error: personalError } = await client
      .from('personal')
      .select('nombre')
      .eq('id', personalId)
      .maybeSingle();
    if (personalError) throw personalError;
    const nombreAdmin = personal?.nombre ?? 'usuario desconocido';

    const notaCambio = `Modificado por el administrador ${nombreAdmin} (monto anterior: ${Number(movimiento.monto).toFixed(2)}) el ${this.fechaHoraLimaTexto()}`;
    const notasNuevas = movimiento.notas ? `${movimiento.notas} — ${notaCambio}` : notaCambio;

    const service = this.supabase.getServiceClient();
    const { error: updError } = await service
      .from('movimientos_caja')
      .update({ monto: dto.monto, notas: notasNuevas })
      .eq('id', movimientoId);
    if (updError) throw updError;

    // Si la sesión ya se cerró, su saldo_final quedó fijo al momento del
    // cierre -- hay que recalcularlo para que refleje el ajuste.
    if (sesion.estado === 'cerrada') {
      const { totalIngresosEfectivo, totalEgresosEfectivo } = await this.sumarMovimientos(
        service,
        sesionId,
      );
      const saldoFinal = Number(sesion.saldo_inicial) + totalIngresosEfectivo - totalEgresosEfectivo;
      const { error: sesError } = await service
        .from('sesiones_turno')
        .update({ saldo_final: saldoFinal })
        .eq('id', sesionId);
      if (sesError) throw sesError;
    }

    return this.obtenerDetalle(client, hotelId, sesionId);
  }

  async listarSesiones(client: SupabaseClient, hotelId: string, estado?: string) {
    let query = client
      .from('sesiones_turno')
      .select(
        `
        id, fecha, saldo_inicial, saldo_final, estado, abierta_en, cerrada_en,
        cerrada_automaticamente,
        turnos(nombre),
        personal_hotel!inner(hotel_id, personal(nombre))
      `,
      )
      .eq('personal_hotel.hotel_id', hotelId)
      .order('abierta_en', { ascending: false });

    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async obtenerSesionActual(client: SupabaseClient, hotelId: string, personalId: string) {
    const personalHotel = await this.cargarPersonalHotel(client, hotelId, personalId);

    const { data, error } = await client
      .from('sesiones_turno')
      .select('id')
      .eq('personal_hotel_id', personalHotel.id)
      .eq('estado', 'abierta')
      .order('abierta_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new NotFoundException('No tienes una sesión de turno abierta en este hotel');
    }
    return this.obtenerDetalle(client, hotelId, data.id);
  }

  /**
   * Estado del turno en curso del usuario, pensado para que el frontend lo
   * consulte periódicamente (ver Layout.tsx): avisa unos minutos antes de
   * que el turno termine para que el recepcionista liquide su caja, y si
   * pasan GRACIA_CIERRE_MINUTOS del fin del turno sin que la haya cerrado,
   * el sistema la cierra solo (mismo patrón de "cron oportunista" que
   * procesarSalidasVencidas: no hay cron real posible en Render free tier,
   * así que esto se dispara en cuanto alguien con la app abierta hace poll).
   * Nunca lanza 404: si no hay sesión abierta simplemente responde eso.
   */
  async obtenerEstadoTurno(client: SupabaseClient, hotelId: string, personalId: string) {
    const personalHotel = await this.cargarPersonalHotel(client, hotelId, personalId);

    const { data: sesion, error } = await client
      .from('sesiones_turno')
      .select('id, fecha, turnos(hora_inicio, hora_fin)')
      .eq('personal_hotel_id', personalHotel.id)
      .eq('estado', 'abierta')
      .order('abierta_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!sesion) {
      return { sesionAbierta: false, avisoCierre: false };
    }

    const turno = (sesion as unknown as { turnos: { hora_inicio: string; hora_fin: string } | null })
      .turnos;
    if (!turno) {
      return { sesionAbierta: true, avisoCierre: false };
    }

    const finTurnoLima = this.calcularFinTurnoLima(sesion.fecha, turno.hora_inicio, turno.hora_fin);
    const ahoraLima = comoRelojLima(new Date());
    const minutosParaFin = Math.round((finTurnoLima.getTime() - ahoraLima.getTime()) / 60000);

    return {
      sesionAbierta: true,
      avisoCierre: minutosParaFin <= AVISO_CIERRE_MINUTOS_ANTES,
      minutosParaFin,
    };
  }

  // hora_fin es solo un time (sin fecha); se combina con la fecha de la
  // sesión interpretándola como hora de Lima. Si hora_fin <= hora_inicio se
  // asume turno nocturno que cruza la medianoche (ej. 22:00–06:00) y el fin
  // cae al día siguiente de la fecha de apertura.
  private calcularFinTurnoLima(fecha: string, horaInicio: string, horaFin: string): Date {
    const [hIni] = horaInicio.split(':').map(Number);
    const [hFin, mFin, sFin] = horaFin.split(':').map(Number);
    const [anio, mes, dia] = fecha.split('-').map(Number);

    const cruzaMedianoche = hFin <= hIni;
    const finLima = new Date(Date.UTC(anio, mes - 1, dia + (cruzaMedianoche ? 1 : 0)));
    finLima.setUTCHours(hFin, mFin, sFin || 0, 0);
    return finLima;
  }

  // Compara solo la hora del reloj (sin fecha) contra el rango [inicio, fin)
  // del turno, en hora Lima. Si hora_fin <= hora_inicio se asume turno
  // nocturno que cruza la medianoche (ej. 22:00-06:00): "ahora" cae dentro
  // si es >= inicio O < fin.
  private estaEnHorarioDelTurno(horaInicio: string, horaFin: string): boolean {
    const ahoraLima = comoRelojLima(new Date());
    const minutosAhora = ahoraLima.getUTCHours() * 60 + ahoraLima.getUTCMinutes();

    const [hIni, mIni] = horaInicio.split(':').map(Number);
    const [hFin, mFin] = horaFin.split(':').map(Number);
    const minutosIni = hIni * 60 + mIni;
    const minutosFin = hFin * 60 + mFin;

    if (minutosFin <= minutosIni) {
      return minutosAhora >= minutosIni || minutosAhora < minutosFin;
    }
    return minutosAhora >= minutosIni && minutosAhora < minutosFin;
  }

  private horaActualLimaTexto(): string {
    const ahoraLima = comoRelojLima(new Date());
    return `${String(ahoraLima.getUTCHours()).padStart(2, '0')}:${String(ahoraLima.getUTCMinutes()).padStart(2, '0')}`;
  }

  private fechaHoraLimaTexto(): string {
    const ahoraLima = comoRelojLima(new Date());
    const dd = String(ahoraLima.getUTCDate()).padStart(2, '0');
    const mm = String(ahoraLima.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = ahoraLima.getUTCFullYear();
    return `${dd}/${mm}/${yyyy} ${this.horaActualLimaTexto()}`;
  }

  // La columna sesiones_turno.fecha tiene "default current_date" en la
  // base, pero eso usa el reloj UTC del servidor de Postgres -- después de
  // las 19:00 hora Lima ya es "mañana" en UTC, así que un turno Noche
  // abierto a esa hora quedaba fechado un día adelantado y desaparecía de
  // Reportes (que filtra por la fecha de Lima). Se calcula acá explícito,
  // igual que el resto de fechas de este archivo.
  private fechaHoyLima(): string {
    const ahoraLima = comoRelojLima(new Date());
    const yyyy = ahoraLima.getUTCFullYear();
    const mm = String(ahoraLima.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(ahoraLima.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async obtenerDetalle(client: SupabaseClient, hotelId: string, sesionId: string) {
    const sesion = await this.cargarSesionHotel(client, hotelId, sesionId);

    const { data: movimientos, error } = await client
      .from('movimientos_caja')
      .select('*')
      .eq('sesion_turno_id', sesionId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const { totalIngresos, totalEgresos, totalIngresosEfectivo, totalEgresosEfectivo } =
      await this.sumarMovimientos(client, sesionId, movimientos);
    // saldoActual (como saldo_final al cerrar) es solo efectivo: ver nota en
    // cerrarTurno(). totalIngresos/totalEgresos siguen sumando todos los
    // métodos, para mostrar el movimiento completo de la sesión.
    const saldoActual = Number(sesion.saldo_inicial) + totalIngresosEfectivo - totalEgresosEfectivo;

    return { ...sesion, movimientos: movimientos ?? [], totalIngresos, totalEgresos, saldoActual };
  }

  private async sumarMovimientos(
    client: SupabaseClient,
    sesionId: string,
    movimientosPrecargados?: { tipo: string; monto: number; metodo_pago: string }[] | null,
  ) {
    const movimientos =
      movimientosPrecargados ??
      (
        await (async () => {
          const { data, error } = await client
            .from('movimientos_caja')
            .select('tipo, monto, metodo_pago')
            .eq('sesion_turno_id', sesionId);
          if (error) throw error;
          return data;
        })()
      );

    const totalIngresos = (movimientos ?? [])
      .filter((m) => m.tipo === 'ingreso')
      .reduce((acc, m) => acc + Number(m.monto), 0);
    const totalEgresos = (movimientos ?? [])
      .filter((m) => m.tipo === 'egreso')
      .reduce((acc, m) => acc + Number(m.monto), 0);
    const totalIngresosEfectivo = (movimientos ?? [])
      .filter((m) => m.tipo === 'ingreso' && m.metodo_pago === 'efectivo')
      .reduce((acc, m) => acc + Number(m.monto), 0);
    const totalEgresosEfectivo = (movimientos ?? [])
      .filter((m) => m.tipo === 'egreso' && m.metodo_pago === 'efectivo')
      .reduce((acc, m) => acc + Number(m.monto), 0);

    return { totalIngresos, totalEgresos, totalIngresosEfectivo, totalEgresosEfectivo };
  }

  private async cargarPersonalHotel(client: SupabaseClient, hotelId: string, personalId: string) {
    const { data, error } = await client
      .from('personal_hotel')
      .select('id')
      .eq('personal_id', personalId)
      .eq('hotel_id', hotelId)
      .eq('activo', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new ForbiddenException('No tienes una asignación activa en este hotel');
    }
    return data;
  }

  private async cargarSesionHotel(
    client: SupabaseClient,
    hotelId: string,
    sesionId: string,
  ): Promise<SesionConHotel> {
    const { data, error } = await client
      .from('sesiones_turno')
      .select(
        `
        id, personal_hotel_id, turno_id, fecha, saldo_inicial, saldo_final,
        estado, abierta_en, cerrada_en, cerrada_automaticamente,
        personal_hotel!inner(hotel_id),
        turnos(nombre, hora_inicio, hora_fin)
      `,
      )
      .eq('id', sesionId)
      .maybeSingle();
    if (error) throw error;

    const data_ = data as unknown as SesionConHotel | null;
    if (!data_ || data_.personal_hotel.hotel_id !== hotelId) {
      throw new NotFoundException('Sesión de turno no encontrada en este hotel');
    }
    return data_;
  }
}
