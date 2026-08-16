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
  turnos: { nombre: string } | null;
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
      .select('id')
      .eq('id', dto.turnoId)
      .eq('hotel_id', hotelId)
      .eq('activo', true)
      .maybeSingle();
    if (turnoError) throw turnoError;
    if (!turno) {
      throw new NotFoundException('El turno no existe o no está activo en este hotel');
    }

    // Herencia de saldo entre sesiones (CLAUDE.md 3.4): el saldo pasa de una
    // caja a la siguiente aunque las trabajen recepcionistas distintos, pero
    // cada quien solo ve sus propios movimientos (RLS restringe
    // sesiones_turno a "mis sesiones" para un no-admin). Por eso esta única
    // lectura del saldo_final del cierre anterior se hace con el cliente de
    // servicio (salta RLS): no se expone nada más de esa sesión ajena, solo
    // se usa su saldo_final como saldo_inicial de la nueva.
    const service = this.supabase.getServiceClient();
    const { data: anterior, error: anteriorError } = await service
      .from('sesiones_turno')
      .select('id, saldo_final, personal_hotel!inner(hotel_id)')
      .eq('personal_hotel.hotel_id', hotelId)
      .eq('estado', 'cerrada')
      .order('cerrada_en', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anteriorError) throw anteriorError;

    const { data: creada, error: insError } = await client
      .from('sesiones_turno')
      .insert({
        personal_hotel_id: personalHotel.id,
        turno_id: dto.turnoId,
        sesion_anterior_id: anterior?.id ?? null,
        saldo_inicial: anterior?.saldo_final ?? 0,
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
        turnos(nombre)
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
