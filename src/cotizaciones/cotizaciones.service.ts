import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { DisponibilidadService } from '../habitaciones/disponibilidad/disponibilidad.service';
import { ReservasService } from '../reservas/reservas.service';
import { CrearReservaDto } from '../reservas/dto/crear-reserva.dto';
import { CrearCotizacionDto } from './dto/crear-cotizacion.dto';
import { CrearCotizacionDetalleDto } from './dto/crear-cotizacion-detalle.dto';
import { EditarCotizacionDetalleDto } from './dto/editar-cotizacion-detalle.dto';
import { EditarFechasCotizacionDto } from './dto/editar-fechas-cotizacion.dto';
import { DisponibilidadCotizacionDto } from './dto/disponibilidad-cotizacion.dto';
import { ActualizarEstadoCotizacionDto } from './dto/actualizar-estado-cotizacion.dto';
import { ListarCotizacionesQueryDto } from './dto/listar-cotizaciones-query.dto';

// Perú (America/Lima) es UTC-5 todo el año -- mismo criterio que en
// caja.service.ts / estadias.service.ts.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function comoRelojLima(fecha: Date): Date {
  return new Date(fecha.getTime() - PERU_UTC_OFFSET_MS);
}

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly disponibilidad: DisponibilidadService,
    private readonly reservasService: ReservasService,
  ) {}

  /**
   * Habitaciones que se pueden ofrecer en el cuadro de la cotización: no
   * bloqueadas, y realmente libres para el check-in/check-out (con hora)
   * que se está cotizando -- mismo motor de disponibilidad que usan
   * Reservas (margen de limpieza por tipo de habitación, ver CLAUDE.md
   * sección 4), para no ofrecer algo que después el checkeo real rechace.
   */
  async habitacionesDisponibles(
    client: SupabaseClient,
    hotelId: string,
    dto: DisponibilidadCotizacionDto,
  ) {
    const checkinISO = `${dto.fechaCheckin}T${dto.horaCheckin}:00`;
    const fechaCheckout = this.sumarDiasYMD(dto.fechaCheckin, dto.noches);
    const checkoutISO = `${fechaCheckout}T${dto.horaCheckout}:00`;

    const evaluadas = await this.evaluarDisponibilidadHabitaciones(client, hotelId, checkinISO, checkoutISO);

    return {
      checkinPrevisto: checkinISO,
      checkoutPrevisto: checkoutISO,
      dias: dto.noches,
      habitaciones: evaluadas.filter((e) => e.resultado.disponible).map((e) => e.habitacion),
    };
  }

  /**
   * Complemento de habitacionesDisponibles(): las que SÍ están ocupadas o
   * sin margen de limpieza en ese rango, con el motivo -- para el botón
   * "Agregar habitación no disponible" del cuadro de cotización. Cotizar
   * una habitación no la bloquea de verdad, así que puede tener sentido
   * ofrecerla igual (ej. el cliente decide más adelante, o se libera antes).
   */
  async habitacionesNoDisponibles(
    client: SupabaseClient,
    hotelId: string,
    dto: DisponibilidadCotizacionDto,
  ) {
    const checkinISO = `${dto.fechaCheckin}T${dto.horaCheckin}:00`;
    const fechaCheckout = this.sumarDiasYMD(dto.fechaCheckin, dto.noches);
    const checkoutISO = `${fechaCheckout}T${dto.horaCheckout}:00`;

    const evaluadas = await this.evaluarDisponibilidadHabitaciones(client, hotelId, checkinISO, checkoutISO);

    return {
      checkinPrevisto: checkinISO,
      checkoutPrevisto: checkoutISO,
      dias: dto.noches,
      habitaciones: evaluadas
        .filter((e) => !e.resultado.disponible)
        .map((e) => ({ ...e.habitacion, motivo: e.resultado.conflicto?.mensaje ?? 'No disponible' })),
    };
  }

  private async evaluarDisponibilidadHabitaciones(
    client: SupabaseClient,
    hotelId: string,
    checkinISO: string,
    checkoutISO: string,
  ) {
    const { data: habitaciones, error: habError } = await client
      .from('habitaciones')
      .select('id, hab_numero, piso, tipo_id, tipos_habitacion(nombre, aforo_max)')
      .eq('hotel_id', hotelId)
      .neq('estado', 'bloqueada')
      .order('hab_numero', { ascending: true });
    if (habError) throw habError;

    return Promise.all(
      (habitaciones ?? []).map(async (h) => {
        const resultado = await this.disponibilidad.validar(client, {
          hotelId,
          habitacionId: h.id,
          checkinPrevisto: checkinISO,
          checkoutPrevisto: checkoutISO,
        });
        return { habitacion: h, resultado };
      }),
    );
  }

  /**
   * Habitaciones disponibles/no disponibles para AGREGAR a una cotización
   * ya grabada (usa sus propias fechas/horas guardadas), excluyendo las que
   * ya están en el cuadro.
   */
  async habitacionesDisponiblesParaCotizacion(client: SupabaseClient, hotelId: string, id: string) {
    return this.habitacionesParaCotizacion(client, hotelId, id, true);
  }

  async habitacionesNoDisponiblesParaCotizacion(client: SupabaseClient, hotelId: string, id: string) {
    return this.habitacionesParaCotizacion(client, hotelId, id, false);
  }

  private async habitacionesParaCotizacion(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    disponibles: boolean,
  ) {
    const actual = await this.obtenerDetalle(client, hotelId, id);
    const checkinISO = `${actual.fecha_desde}T${actual.hora_checkin}`;
    const checkoutISO = `${actual.fecha_hasta}T${actual.hora_checkout}`;

    const evaluadas = await this.evaluarDisponibilidadHabitaciones(client, hotelId, checkinISO, checkoutISO);
    const idsEnCuadro = new Set(actual.cotizacion_detalle.map((l: any) => l.habitacion_id));

    return {
      habitaciones: evaluadas
        .filter((e) => e.resultado.disponible === disponibles && !idsEnCuadro.has(e.habitacion.id))
        .map((e) =>
          disponibles
            ? e.habitacion
            : { ...e.habitacion, motivo: e.resultado.conflicto?.mensaje ?? 'No disponible' },
        ),
    };
  }

  // personalId es null cuando la crea el agente de WhatsApp sin
  // intervención de personal. `opciones` también es para ese caso: una
  // cotización directa del bot (bajo el umbral, con precio automático) nace
  // 'aprobada'; una de grupo grande nace 'pendiente_revision' -- ver
  // CotizacionPublicaService.
  async crear(
    client: SupabaseClient,
    hotelId: string,
    dto: CrearCotizacionDto,
    personalId: string | null,
    opciones?: { estado?: 'pendiente' | 'pendiente_revision' | 'aprobada'; origen?: 'manual' | 'whatsapp' },
  ) {
    if (!dto.huespedId && !dto.empresaId) {
      throw new BadRequestException(
        'La cotización debe tener un huésped o una empresa asociada.',
      );
    }
    if (new Date(dto.fechaHasta) <= new Date(dto.fechaDesde)) {
      throw new BadRequestException('fechaHasta debe ser posterior a fechaDesde');
    }

    // Cotizaciones cubren un único rango de fechas para todas sus líneas
    // (grupos que llegan y se van juntos), con la hora de check-in/check-out
    // que se usó para armar el cuadro (ver habitacionesDisponibles()) -- se
    // revalida acá porque pudo pasar tiempo desde que se armó el cuadro.
    const checkinISO = `${dto.fechaDesde}T${dto.horaCheckin}:00`;
    const checkoutISO = `${dto.fechaHasta}T${dto.horaCheckout}:00`;

    for (const linea of dto.habitaciones) {
      // "Agregar habitación no disponible": el usuario ya vio el motivo en
      // pantalla y decidió cotizarla igual -- salta el chequeo acá, pero
      // sigue siendo obligatorio al convertir a reserva (ReservasService.crear()).
      if (linea.forzarNoDisponible) continue;

      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: linea.habitacionId,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
      });
      if (!resultado.disponible) {
        throw new ConflictException(resultado.conflicto?.mensaje ?? 'La habitación no está disponible en ese rango');
      }
    }

    const dias = this.calcularDias(dto.fechaDesde, dto.fechaHasta);

    const totalEstimado = dto.habitaciones.reduce(
      (acc, l) => acc + l.nroPersonas * l.precioPersona * dias,
      0,
    );
    const venceEn =
      dto.venceEn ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: cotizacion, error: cotizacionError } = await client
      .from('cotizaciones')
      .insert({
        hotel_id: hotelId,
        huesped_id: dto.huespedId ?? null,
        empresa_id: dto.empresaId ?? null,
        fecha_emision: this.fechaHoyLima(),
        fecha_desde: dto.fechaDesde,
        fecha_hasta: dto.fechaHasta,
        hora_checkin: dto.horaCheckin,
        hora_checkout: dto.horaCheckout,
        moneda: dto.moneda ?? 'PEN',
        estado: opciones?.estado ?? 'pendiente',
        total_estimado: totalEstimado,
        creado_por: personalId,
        vence_en: venceEn,
        origen: opciones?.origen ?? 'manual',
      })
      .select()
      .single();
    if (cotizacionError) throw cotizacionError;

    const filas = dto.habitaciones.map((l) => ({
      cotizacion_id: cotizacion.id,
      habitacion_id: l.habitacionId,
      nro_personas: l.nroPersonas,
      dias,
      precio_persona: l.precioPersona,
      notas: l.notas?.trim() || null,
      subtotal: l.nroPersonas * l.precioPersona * dias,
      disponibilidad_forzada: !!l.forzarNoDisponible,
    }));

    const { error: detalleError } = await client.from('cotizacion_detalle').insert(filas);
    if (detalleError) {
      await client.from('cotizaciones').delete().eq('id', cotizacion.id);
      throw detalleError;
    }

    return this.obtenerDetalle(client, hotelId, cotizacion.id);
  }

  async listar(client: SupabaseClient, hotelId: string, filtros: ListarCotizacionesQueryDto) {
    let query = client
      .from('cotizaciones')
      .select(
        `
        id, fecha_emision, fecha_desde, fecha_hasta, estado, moneda,
        total_estimado, vence_en, reserva_id,
        huespedes(nombres, apellidos), empresas(razon_social),
        cotizacion_detalle(nro_personas)
      `,
      )
      .eq('hotel_id', hotelId)
      .order('fecha_emision', { ascending: false });

    if (filtros.estado) query = query.eq('estado', filtros.estado);
    if (filtros.desde) query = query.gte('fecha_emision', filtros.desde);
    if (filtros.hasta) query = query.lte('fecha_emision', filtros.hasta);

    const { data, error } = await query;
    if (error) throw error;

    const filas = (data ?? []).map((c: any) => ({
      id: c.id,
      fecha_emision: c.fecha_emision,
      fecha_desde: c.fecha_desde,
      fecha_hasta: c.fecha_hasta,
      estado: c.estado,
      moneda: c.moneda,
      total_estimado: c.total_estimado,
      vence_en: c.vence_en,
      reserva_id: c.reserva_id,
      huespedes: c.huespedes,
      empresas: c.empresas,
      totalPersonas: (c.cotizacion_detalle ?? []).reduce(
        (acc: number, d: any) => acc + Number(d.nro_personas ?? 0),
        0,
      ),
    }));

    // Igual que ReservasService.listar(): el nombre puede venir de
    // huespedes o de empresas (dos tablas embebidas distintas), así que se
    // filtra en memoria en vez de encadenar un OR entre ambas.
    const busqueda = filtros.busqueda?.trim().toLowerCase();
    if (busqueda) {
      return filas.filter((f) => {
        const nombre = f.huespedes
          ? `${f.huespedes.nombres} ${f.huespedes.apellidos}`
          : (f.empresas?.razon_social ?? '');
        return nombre.toLowerCase().includes(busqueda);
      });
    }
    return filas;
  }

  async obtenerDetalle(client: SupabaseClient, hotelId: string, id: string) {
    const { data, error } = await client
      .from('cotizaciones')
      .select(
        `
        *,
        huespedes(*), empresas(*),
        cotizacion_detalle(*, habitaciones(hab_numero, piso, tipos_habitacion(nombre)))
      `,
      )
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Cotización no encontrada');

    // cotizacion_detalle es el lado "muchos" y habitaciones es un embed "a
    // uno" -- PostgREST no soporta ordenar por una columna de un embed "a
    // uno" (mismo caso que reserva_habitacion/estadias en
    // ReservasService.listar()), así que se ordena en memoria. El volumen
    // por cotización es chico (unas pocas habitaciones), no hace falta
    // resolverlo a nivel de base de datos.
    (data as any).cotizacion_detalle = ((data as any).cotizacion_detalle ?? []).sort(
      (a: any, b: any) => (a.habitaciones?.hab_numero ?? 0) - (b.habitaciones?.hab_numero ?? 0),
    );
    return data;
  }

  async actualizarEstado(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    dto: ActualizarEstadoCotizacionDto,
  ) {
    const actual = await this.obtenerDetalle(client, hotelId, id);
    if (actual.estado === 'convertida') {
      throw new BadRequestException(
        'Esta cotización ya fue convertida en reserva; no se puede cambiar su estado',
      );
    }

    const { data, error } = await client
      .from('cotizaciones')
      .update({ estado: dto.estado })
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Cotización no encontrada');
    return data;
  }

  /**
   * Cambia el rango de check-in/check-out de una cotización ya grabada.
   * Revalida disponibilidad de cada línea del cuadro contra las nuevas
   * fechas (igual que crear() -- las líneas "no disponible" forzadas no se
   * revalidan) y recalcula días/subtotal de cada línea y el total, porque
   * "días" depende del rango completo, no de cada línea por separado.
   */
  async editarFechas(client: SupabaseClient, hotelId: string, id: string, dto: EditarFechasCotizacionDto) {
    const actual = await this.obtenerDetalle(client, hotelId, id);
    if (actual.estado === 'convertida') {
      throw new BadRequestException(
        'Esta cotización ya fue convertida en reserva; no se pueden editar sus fechas',
      );
    }
    if (new Date(dto.fechaHasta) <= new Date(dto.fechaDesde)) {
      throw new BadRequestException('fechaHasta debe ser posterior a fechaDesde');
    }

    const checkinISO = `${dto.fechaDesde}T${dto.horaCheckin}:00`;
    const checkoutISO = `${dto.fechaHasta}T${dto.horaCheckout}:00`;

    for (const linea of actual.cotizacion_detalle as any[]) {
      if (linea.disponibilidad_forzada) continue;
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: linea.habitacion_id,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
      });
      if (!resultado.disponible) {
        const numero = linea.habitaciones?.hab_numero;
        throw new ConflictException(
          `Hab. ${numero ?? '—'}: ${resultado.conflicto?.mensaje ?? 'no está disponible en el nuevo rango de fechas'}`,
        );
      }
    }

    const dias = this.calcularDias(dto.fechaDesde, dto.fechaHasta);

    for (const linea of actual.cotizacion_detalle as any[]) {
      const subtotal =
        linea.precio_persona != null
          ? Number(linea.nro_personas) * Number(linea.precio_persona) * dias
          : Number(linea.precio_noche ?? 0) * dias;
      const { error: updLineaError } = await client
        .from('cotizacion_detalle')
        .update({ dias, subtotal })
        .eq('id', linea.id);
      if (updLineaError) throw updLineaError;
    }

    const { error: updError } = await client
      .from('cotizaciones')
      .update({
        fecha_desde: dto.fechaDesde,
        fecha_hasta: dto.fechaHasta,
        hora_checkin: dto.horaCheckin,
        hora_checkout: dto.horaCheckout,
      })
      .eq('id', id);
    if (updError) throw updError;

    await this.recalcularTotal(client, id);
    return this.obtenerDetalle(client, hotelId, id);
  }

  /**
   * Saca una habitación del cuadro de una cotización ya grabada (ej. el
   * cliente ya no quiere esa habitación) y recalcula el total_estimado con
   * las líneas que quedan. No se puede editar una cotización ya convertida
   * en reserva -- ahí la reserva real es la que se edita.
   */
  async eliminarLinea(client: SupabaseClient, hotelId: string, id: string, lineaId: string) {
    const actual = await this.obtenerDetalle(client, hotelId, id);
    if (actual.estado === 'convertida') {
      throw new BadRequestException(
        'Esta cotización ya fue convertida en reserva; no se puede editar su cuadro',
      );
    }

    const linea = actual.cotizacion_detalle.find((l: any) => l.id === lineaId);
    if (!linea) throw new NotFoundException('Línea de cotización no encontrada');

    const { error: delError } = await client
      .from('cotizacion_detalle')
      .delete()
      .eq('id', lineaId)
      .eq('cotizacion_id', id);
    if (delError) throw delError;

    await this.recalcularTotal(client, id);
    return this.obtenerDetalle(client, hotelId, id);
  }

  /**
   * Agrega una habitación al cuadro de una cotización ya grabada, con las
   * mismas fechas/horas de la cotización. Por defecto revalida
   * disponibilidad igual que crear() -- forzarNoDisponible la salta (botón
   * "Agregar habitación no disponible").
   */
  async agregarLinea(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    dto: CrearCotizacionDetalleDto,
  ) {
    const actual = await this.obtenerDetalle(client, hotelId, id);
    if (actual.estado === 'convertida') {
      throw new BadRequestException(
        'Esta cotización ya fue convertida en reserva; no se puede editar su cuadro',
      );
    }
    if (actual.cotizacion_detalle.some((l: any) => l.habitacion_id === dto.habitacionId)) {
      throw new ConflictException('Esa habitación ya está en el cuadro de esta cotización');
    }

    const checkinISO = `${actual.fecha_desde}T${actual.hora_checkin}`;
    const checkoutISO = `${actual.fecha_hasta}T${actual.hora_checkout}`;

    if (!dto.forzarNoDisponible) {
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: dto.habitacionId,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
      });
      if (!resultado.disponible) {
        throw new ConflictException(resultado.conflicto?.mensaje ?? 'La habitación no está disponible en ese rango');
      }
    }

    const dias = this.calcularDias(actual.fecha_desde, actual.fecha_hasta);
    const { error: insError } = await client.from('cotizacion_detalle').insert({
      cotizacion_id: id,
      habitacion_id: dto.habitacionId,
      nro_personas: dto.nroPersonas,
      dias,
      precio_persona: dto.precioPersona,
      notas: dto.notas?.trim() || null,
      subtotal: dto.nroPersonas * dto.precioPersona * dias,
      disponibilidad_forzada: !!dto.forzarNoDisponible,
    });
    if (insError) throw insError;

    await this.recalcularTotal(client, id);
    return this.obtenerDetalle(client, hotelId, id);
  }

  /**
   * Edita cantidad de personas, precio por persona y/o notas de una línea
   * ya grabada (ej. el cliente pidió una habitación más cara, o cambió de
   * cuántos son). No permite mover la habitación ni las fechas -- para eso
   * se quita la línea y se agrega otra.
   */
  async editarLinea(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    lineaId: string,
    dto: EditarCotizacionDetalleDto,
  ) {
    const actual = await this.obtenerDetalle(client, hotelId, id);
    if (actual.estado === 'convertida') {
      throw new BadRequestException(
        'Esta cotización ya fue convertida en reserva; no se puede editar su cuadro',
      );
    }

    const linea = actual.cotizacion_detalle.find((l: any) => l.id === lineaId);
    if (!linea) throw new NotFoundException('Línea de cotización no encontrada');

    const nroPersonas = dto.nroPersonas ?? linea.nro_personas;
    const precioPersona = dto.precioPersona ?? Number(linea.precio_persona ?? 0);
    const notas = dto.notas !== undefined ? dto.notas.trim() || null : linea.notas;
    const tipoManual =
      dto.tipoManual !== undefined ? dto.tipoManual.trim() || null : linea.tipo_manual;
    const subtotal = nroPersonas * precioPersona * Number(linea.dias);

    const { error: updLineaError } = await client
      .from('cotizacion_detalle')
      .update({
        nro_personas: nroPersonas,
        precio_persona: precioPersona,
        notas,
        tipo_manual: tipoManual,
        subtotal,
      })
      .eq('id', lineaId)
      .eq('cotizacion_id', id);
    if (updLineaError) throw updLineaError;

    await this.recalcularTotal(client, id);
    return this.obtenerDetalle(client, hotelId, id);
  }

  private async recalcularTotal(client: SupabaseClient, cotizacionId: string) {
    const { data, error } = await client
      .from('cotizacion_detalle')
      .select('subtotal')
      .eq('cotizacion_id', cotizacionId);
    if (error) throw error;

    const totalEstimado = (data ?? []).reduce((acc, d) => acc + Number(d.subtotal), 0);
    const { error: updError } = await client
      .from('cotizaciones')
      .update({ total_estimado: totalEstimado })
      .eq('id', cotizacionId);
    if (updError) throw updError;
  }

  /**
   * Copia (no enlaza) los datos de la cotización a una reserva nueva y
   * editable, reutilizando ReservasService.crear() para heredar su misma
   * validación de disponibilidad (re-chequeada, porque pudo haber pasado
   * tiempo desde que se cotizó) y su lógica de creación. Ver CLAUDE.md 3.5.
   */
  async convertir(client: SupabaseClient, hotelId: string, id: string, personalId: string) {
    const cotizacion = await this.obtenerDetalle(client, hotelId, id);

    if (!['pendiente', 'aprobada'].includes(cotizacion.estado)) {
      throw new BadRequestException(
        `No se puede convertir una cotización en estado '${cotizacion.estado}'`,
      );
    }

    const checkinISO = `${cotizacion.fecha_desde}T${cotizacion.hora_checkin}`;
    const checkoutISO = `${cotizacion.fecha_hasta}T${cotizacion.hora_checkout}`;

    const reservaDto: CrearReservaDto = {
      huespedId: cotizacion.huesped_id ?? undefined,
      empresaId: cotizacion.empresa_id ?? undefined,
      origen: 'directo',
      moneda: cotizacion.moneda,
      habitaciones: cotizacion.cotizacion_detalle.map((d: any) => ({
        habitacionId: d.habitacion_id,
        nroPersonas: d.nro_personas,
        tipoAlquiler: 'pernocte' as const,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
        // Reservas cotiza por habitación por noche -- se convierte el
        // precio por persona (o, en cotizaciones viejas del flujo
        // anterior, el precio_noche que ya tenían) al equivalente por
        // habitación para no perder el total cotizado.
        tarifaDiaManual:
          d.precio_persona != null ? Number(d.precio_persona) * Number(d.nro_personas) : Number(d.precio_noche),
      })),
    };

    const reserva = await this.reservasService.crear(client, hotelId, reservaDto, personalId);

    const { error: updError } = await client
      .from('cotizaciones')
      .update({ estado: 'convertida', reserva_id: reserva.id })
      .eq('id', id);
    if (updError) throw updError;

    return { cotizacion: { ...cotizacion, estado: 'convertida', reserva_id: reserva.id }, reserva };
  }

  // cotizaciones.fecha_emision tiene "default current_date" en la base,
  // pero eso usa el reloj UTC del servidor de Postgres -- después de las
  // 19:00 hora Lima ya es "mañana" en UTC, así que una cotización creada a
  // esa hora quedaba fechada un día adelantado y no aparecía en el filtro
  // de fecha de emisión de Cotizaciones.tsx (que filtra por hoy en hora
  // Lima). Se calcula acá explícito, igual que fechaHoyLima() en
  // caja.service.ts.
  private fechaHoyLima(): string {
    const ahoraLima = comoRelojLima(new Date());
    const yyyy = ahoraLima.getUTCFullYear();
    const mm = String(ahoraLima.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(ahoraLima.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // YYYY-MM-DD + N días -> YYYY-MM-DD, sin líos de zona horaria (mismo
  // patrón que sumarDiasYMD en reportes.service.ts).
  private sumarDiasYMD(fechaYMD: string, dias: number): string {
    const [anio, mes, dia] = fechaYMD.split('-').map(Number);
    const d = new Date(Date.UTC(anio, mes - 1, dia));
    d.setUTCDate(d.getUTCDate() + dias);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  private calcularDias(fechaDesde: string, fechaHasta: string): number {
    return Math.max(
      1,
      Math.ceil((new Date(fechaHasta).getTime() - new Date(fechaDesde).getTime()) / (1000 * 60 * 60 * 24)),
    );
  }
}
