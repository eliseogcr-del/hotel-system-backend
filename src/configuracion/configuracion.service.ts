import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearTipoHabitacionDto } from './dto/crear-tipo-habitacion.dto';
import { ActualizarTipoHabitacionDto } from './dto/actualizar-tipo-habitacion.dto';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';
import { ActualizarHabitacionDto } from './dto/actualizar-habitacion.dto';
import { CrearCocheraDto } from './dto/crear-cochera.dto';
import { ActualizarCocheraDto } from './dto/actualizar-cochera.dto';
import { ActualizarHotelDto } from './dto/actualizar-hotel.dto';

const CODIGO_UNIQUE_VIOLATION = '23505';
const CODIGO_FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class ConfiguracionService {
  // ---------- Hotel (horas de check-in/checkout) ----------

  async obtenerHotel(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('hoteles')
      .select('id, nombre, hora_checkin, hora_checkout, modo_24h')
      .eq('id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Hotel no encontrado');
    return data;
  }

  async actualizarHotel(client: SupabaseClient, hotelId: string, dto: ActualizarHotelDto) {
    const cambios: Record<string, unknown> = {};
    if (dto.horaCheckin !== undefined) cambios.hora_checkin = dto.horaCheckin;
    if (dto.horaCheckout !== undefined) cambios.hora_checkout = dto.horaCheckout;
    if (dto.modo24h !== undefined) cambios.modo_24h = dto.modo24h;

    const { data, error } = await client
      .from('hoteles')
      .update(cambios)
      .eq('id', hotelId)
      .select('id, nombre, hora_checkin, hora_checkout, modo_24h')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Hotel no encontrado');
    return data;
  }

  // ---------- Tipos de habitación ----------

  async crearTipoHabitacion(client: SupabaseClient, hotelId: string, dto: CrearTipoHabitacionDto) {
    const precioCosto = dto.precioCosto ?? 0;
    const precioCorporativo = dto.precioCorporativo ?? dto.precioNormal;
    const precioWeb = dto.precioWeb ?? dto.precioNormal;
    this.validarPisoDeCosto(
      { normal: dto.precioNormal, corporativo: precioCorporativo, web: precioWeb, porHora: dto.precioPorHora },
      precioCosto,
    );

    const { data, error } = await client
      .from('tipos_habitacion')
      .insert({
        hotel_id: hotelId,
        nombre: dto.nombre,
        aforo_max: dto.aforoMax,
        tiempo_limpieza_min: dto.tiempoLimpiezaMin ?? 45,
        activo: true,
        precio_normal: dto.precioNormal,
        precio_corporativo: precioCorporativo,
        precio_web: precioWeb,
        precio_por_hora: dto.precioPorHora ?? null,
        precio_costo: precioCosto,
      })
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
        throw new ConflictException('Ya existe un tipo de habitación con ese nombre en este hotel');
      }
      throw error;
    }
    return data;
  }

  async listarTiposHabitacion(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('tipos_habitacion')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data;
  }

  async actualizarTipoHabitacion(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    dto: ActualizarTipoHabitacionDto,
  ) {
    const tocaPrecios =
      dto.precioNormal !== undefined ||
      dto.precioCorporativo !== undefined ||
      dto.precioWeb !== undefined ||
      dto.precioPorHora !== undefined ||
      dto.precioCosto !== undefined;

    if (tocaPrecios) {
      const { data: actual, error: actualError } = await client
        .from('tipos_habitacion')
        .select('precio_normal, precio_corporativo, precio_web, precio_por_hora, precio_costo')
        .eq('id', id)
        .eq('hotel_id', hotelId)
        .maybeSingle();
      if (actualError) throw actualError;
      if (!actual) throw new NotFoundException('Tipo de habitación no encontrado en este hotel');

      const precioCosto = dto.precioCosto ?? Number(actual.precio_costo);
      this.validarPisoDeCosto(
        {
          normal: dto.precioNormal ?? Number(actual.precio_normal),
          corporativo: dto.precioCorporativo ?? Number(actual.precio_corporativo),
          web: dto.precioWeb ?? Number(actual.precio_web),
          porHora:
            dto.precioPorHora !== undefined
              ? dto.precioPorHora
              : actual.precio_por_hora != null
                ? Number(actual.precio_por_hora)
                : undefined,
        },
        precioCosto,
      );
    }

    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.aforoMax !== undefined) cambios.aforo_max = dto.aforoMax;
    if (dto.tiempoLimpiezaMin !== undefined) cambios.tiempo_limpieza_min = dto.tiempoLimpiezaMin;
    if (dto.activo !== undefined) cambios.activo = dto.activo;
    if (dto.precioNormal !== undefined) cambios.precio_normal = dto.precioNormal;
    if (dto.precioCorporativo !== undefined) cambios.precio_corporativo = dto.precioCorporativo;
    if (dto.precioWeb !== undefined) cambios.precio_web = dto.precioWeb;
    if (dto.precioPorHora !== undefined) cambios.precio_por_hora = dto.precioPorHora;
    if (dto.precioCosto !== undefined) cambios.precio_costo = dto.precioCosto;

    const { data, error } = await client
      .from('tipos_habitacion')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
        throw new ConflictException('Ya existe un tipo de habitación con ese nombre en este hotel');
      }
      throw error;
    }
    if (!data) throw new NotFoundException('Tipo de habitación no encontrado en este hotel');
    return data;
  }

  private validarPisoDeCosto(
    precios: { normal: number; corporativo: number; web: number; porHora?: number },
    precioCosto: number,
  ) {
    if (precioCosto <= 0) return; // sin piso configurado todavía
    const entradas: [string, number | undefined][] = [
      ['normal', precios.normal],
      ['corporativo', precios.corporativo],
      ['web', precios.web],
      ['por hora', precios.porHora],
    ];
    for (const [nombre, valor] of entradas) {
      if (valor !== undefined && valor < precioCosto) {
        throw new BadRequestException(
          `El precio ${nombre} (S/. ${valor}) no puede ser menor al precio de costo (S/. ${precioCosto})`,
        );
      }
    }
  }

  async eliminarTipoHabitacion(client: SupabaseClient, hotelId: string, id: string) {
    const { data, error } = await client
      .from('tipos_habitacion')
      .delete()
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select('id')
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === CODIGO_FOREIGN_KEY_VIOLATION) {
        throw new ConflictException(
          'No se puede eliminar: hay habitaciones o tarifas usando este tipo. Desactívalo en vez de eliminarlo.',
        );
      }
      throw error;
    }
    if (!data) throw new NotFoundException('Tipo de habitación no encontrado en este hotel');
    return { eliminado: true };
  }

  // ---------- Habitaciones ----------

  async crearHabitacion(client: SupabaseClient, hotelId: string, dto: CrearHabitacionDto) {
    const { data: tipo, error: tipoError } = await client
      .from('tipos_habitacion')
      .select('id')
      .eq('id', dto.tipoId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (tipoError) throw tipoError;
    if (!tipo) throw new NotFoundException('El tipo de habitación no existe en este hotel');

    const { data, error } = await client
      .from('habitaciones')
      .insert({
        hotel_id: hotelId,
        hab_numero: dto.habNumero,
        tipo_id: dto.tipoId,
        piso: dto.piso,
        estado: 'disponible',
      })
      .select('*, tipos_habitacion(nombre)')
      .single();

    if (error) {
      if ((error as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
        throw new ConflictException('Ya existe una habitación con ese número en este hotel');
      }
      throw error;
    }
    return data;
  }

  async actualizarHabitacion(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    dto: ActualizarHabitacionDto,
  ) {
    const cambios: Record<string, unknown> = {};
    if (dto.tipoId !== undefined) cambios.tipo_id = dto.tipoId;
    if (dto.piso !== undefined) cambios.piso = dto.piso;
    if (dto.estado !== undefined) cambios.estado = dto.estado;
    if (dto.mantenimientoPlanificado !== undefined) {
      cambios.mantenimiento_planificado = dto.mantenimientoPlanificado;
    }

    const { data, error } = await client
      .from('habitaciones')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select('*, tipos_habitacion(nombre)')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Habitación no encontrada en este hotel');
    return data;
  }

  async eliminarHabitacion(client: SupabaseClient, hotelId: string, id: string) {
    const { data, error } = await client
      .from('habitaciones')
      .delete()
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select('id')
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === CODIGO_FOREIGN_KEY_VIOLATION) {
        throw new ConflictException(
          'No se puede eliminar: esta habitación ya tiene reservas o historial asociado.',
        );
      }
      throw error;
    }
    if (!data) throw new NotFoundException('Habitación no encontrada en este hotel');
    return { eliminado: true };
  }

  // ---------- Cocheras ----------

  async crearCochera(client: SupabaseClient, hotelId: string, dto: CrearCocheraDto) {
    const { data, error } = await client
      .from('cocheras')
      .insert({
        hotel_id: hotelId,
        numero: dto.numero,
        tamano: dto.tamano,
        tipo_vehiculo_permitido: dto.tipoVehiculoPermitido ?? null,
        es_externa: dto.esExterna ?? false,
        precio_externa: dto.precioExterna ?? 0,
        estado: 'disponible',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listarCocheras(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('cocheras')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('numero', { ascending: true });
    if (error) throw error;
    return data;
  }

  async actualizarCochera(
    client: SupabaseClient,
    hotelId: string,
    id: string,
    dto: ActualizarCocheraDto,
  ) {
    const cambios: Record<string, unknown> = {};
    if (dto.numero !== undefined) cambios.numero = dto.numero;
    if (dto.tamano !== undefined) cambios.tamano = dto.tamano;
    if (dto.tipoVehiculoPermitido !== undefined) cambios.tipo_vehiculo_permitido = dto.tipoVehiculoPermitido;
    if (dto.estado !== undefined) cambios.estado = dto.estado;
    if (dto.esExterna !== undefined) cambios.es_externa = dto.esExterna;
    if (dto.precioExterna !== undefined) cambios.precio_externa = dto.precioExterna;

    const { data, error } = await client
      .from('cocheras')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Cochera no encontrada en este hotel');
    return data;
  }
}
