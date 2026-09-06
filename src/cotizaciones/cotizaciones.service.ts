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
import { DisponibilidadCotizacionDto } from './dto/disponibilidad-cotizacion.dto';
import { ActualizarEstadoCotizacionDto } from './dto/actualizar-estado-cotizacion.dto';
import { ListarCotizacionesQueryDto } from './dto/listar-cotizaciones-query.dto';

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

    const { data: habitaciones, error: habError } = await client
      .from('habitaciones')
      .select('id, hab_numero, piso, tipo_id, tipos_habitacion(nombre, aforo_max)')
      .eq('hotel_id', hotelId)
      .neq('estado', 'bloqueada')
      .order('hab_numero', { ascending: true });
    if (habError) throw habError;

    const candidatas = await Promise.all(
      (habitaciones ?? []).map(async (h) => {
        const resultado = await this.disponibilidad.validar(client, {
          hotelId,
          habitacionId: h.id,
          checkinPrevisto: checkinISO,
          checkoutPrevisto: checkoutISO,
        });
        return resultado.disponible ? h : null;
      }),
    );

    return {
      checkinPrevisto: checkinISO,
      checkoutPrevisto: checkoutISO,
      dias: dto.noches,
      habitaciones: candidatas.filter((h): h is NonNullable<typeof h> => h !== null),
    };
  }

  async crear(
    client: SupabaseClient,
    hotelId: string,
    dto: CrearCotizacionDto,
    personalId: string,
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

    const dias = Math.max(
      1,
      Math.ceil(
        (new Date(dto.fechaHasta).getTime() - new Date(dto.fechaDesde).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

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
        fecha_desde: dto.fechaDesde,
        fecha_hasta: dto.fechaHasta,
        hora_checkin: dto.horaCheckin,
        hora_checkout: dto.horaCheckout,
        moneda: dto.moneda ?? 'PEN',
        estado: 'pendiente',
        total_estimado: totalEstimado,
        adelanto: dto.adelanto ?? 0,
        creado_por: personalId,
        vence_en: venceEn,
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

    const totalEstimado = actual.cotizacion_detalle
      .filter((l: any) => l.id !== lineaId)
      .reduce((acc: number, l: any) => acc + Number(l.subtotal), 0);

    const { error: updError } = await client
      .from('cotizaciones')
      .update({ total_estimado: totalEstimado })
      .eq('id', id);
    if (updError) throw updError;

    return this.obtenerDetalle(client, hotelId, id);
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

  // YYYY-MM-DD + N días -> YYYY-MM-DD, sin líos de zona horaria (mismo
  // patrón que sumarDiasYMD en reportes.service.ts).
  private sumarDiasYMD(fechaYMD: string, dias: number): string {
    const [anio, mes, dia] = fechaYMD.split('-').map(Number);
    const d = new Date(Date.UTC(anio, mes - 1, dia));
    d.setUTCDate(d.getUTCDate() + dias);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
}
