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
import { ActualizarEstadoCotizacionDto } from './dto/actualizar-estado-cotizacion.dto';
import { ListarCotizacionesQueryDto } from './dto/listar-cotizaciones-query.dto';

interface LineaConCosto {
  linea: CrearCotizacionDetalleDto;
  precioNoche: number;
  tarifaId: string | null;
  subtotal: number;
}

@Injectable()
export class CotizacionesService {
  constructor(
    private readonly disponibilidad: DisponibilidadService,
    private readonly reservasService: ReservasService,
  ) {}

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
    // (grupos que llegan y se van juntos). Se usan horas estándar de
    // check-in/check-out para el motor de disponibilidad.
    const checkinISO = `${dto.fechaDesde}T15:00:00`;
    const checkoutISO = `${dto.fechaHasta}T11:00:00`;

    for (const linea of dto.habitaciones) {
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: linea.habitacionId,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
      });
      if (!resultado.disponible) {
        throw new ConflictException(resultado.conflicto);
      }
    }

    const dias = Math.max(
      1,
      Math.ceil(
        (new Date(dto.fechaHasta).getTime() - new Date(dto.fechaDesde).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    );

    const lineasConCosto = await Promise.all(
      dto.habitaciones.map((linea) =>
        this.resolverLinea(client, hotelId, dto.empresaId, dias, linea),
      ),
    );

    const totalEstimado = lineasConCosto.reduce((acc, l) => acc + l.subtotal, 0);
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
        moneda: dto.moneda ?? 'PEN',
        estado: 'pendiente',
        total_estimado: totalEstimado,
        creado_por: personalId,
        vence_en: venceEn,
      })
      .select()
      .single();
    if (cotizacionError) throw cotizacionError;

    const filas = lineasConCosto.map((l) => ({
      cotizacion_id: cotizacion.id,
      habitacion_id: l.linea.habitacionId,
      tarifa_id: l.tarifaId,
      nro_personas: l.linea.nroPersonas,
      dias,
      precio_noche: l.precioNoche,
      subtotal: l.subtotal,
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
        huespedes(nombres, apellidos), empresas(razon_social)
      `,
      )
      .eq('hotel_id', hotelId)
      .order('fecha_emision', { ascending: false });

    if (filtros.estado) query = query.eq('estado', filtros.estado);

    const { data, error } = await query;
    if (error) throw error;
    return data;
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

    const checkinISO = `${cotizacion.fecha_desde}T15:00:00`;
    const checkoutISO = `${cotizacion.fecha_hasta}T11:00:00`;

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
        tarifaDiaManual: Number(d.precio_noche),
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

  private async resolverLinea(
    client: SupabaseClient,
    hotelId: string,
    empresaId: string | undefined,
    dias: number,
    linea: CrearCotizacionDetalleDto,
  ): Promise<LineaConCosto> {
    const { data: hab, error: habError } = await client
      .from('habitaciones')
      .select('id, tipo_id')
      .eq('id', linea.habitacionId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (habError) throw habError;
    if (!hab) {
      throw new NotFoundException(`La habitación ${linea.habitacionId} no existe en este hotel`);
    }

    let precioNoche = linea.precioNocheManual;
    let tarifaId: string | null = null;

    if (precioNoche === undefined && empresaId) {
      const { data: especial, error: especialError } = await client
        .from('tarifas_especiales')
        .select('tarifa_real')
        .eq('hotel_id', hotelId)
        .eq('empresa_id', empresaId)
        .maybeSingle();
      if (especialError) throw especialError;
      if (especial?.tarifa_real != null) {
        precioNoche = Number(especial.tarifa_real);
      }
    }

    if (precioNoche === undefined) {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: tarifa, error: tarifaError } = await client
        .from('tarifas')
        .select('id, normal')
        .eq('hotel_id', hotelId)
        .eq('tipo_hab_id', hab.tipo_id)
        .lte('vigente_desde', hoy)
        .order('vigente_desde', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tarifaError) throw tarifaError;
      if (!tarifa) {
        throw new NotFoundException(
          `No hay tarifa vigente para el tipo de habitación de ${linea.habitacionId}`,
        );
      }
      precioNoche = Number(tarifa.normal);
      tarifaId = tarifa.id;
    }

    const subtotal = precioNoche * dias;
    return { linea, precioNoche, tarifaId, subtotal };
  }
}
