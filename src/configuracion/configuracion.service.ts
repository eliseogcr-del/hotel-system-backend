import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearTipoHabitacionDto } from './dto/crear-tipo-habitacion.dto';
import { ActualizarTipoHabitacionDto } from './dto/actualizar-tipo-habitacion.dto';
import { CrearHabitacionDto } from './dto/crear-habitacion.dto';
import { ActualizarHabitacionDto } from './dto/actualizar-habitacion.dto';
import { CrearTarifaDto } from './dto/crear-tarifa.dto';
import { CrearCocheraDto } from './dto/crear-cochera.dto';
import { ActualizarCocheraDto } from './dto/actualizar-cochera.dto';

const CODIGO_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ConfiguracionService {
  // ---------- Tipos de habitación ----------

  async crearTipoHabitacion(client: SupabaseClient, hotelId: string, dto: CrearTipoHabitacionDto) {
    const { data, error } = await client
      .from('tipos_habitacion')
      .insert({
        hotel_id: hotelId,
        nombre: dto.nombre,
        aforo_max: dto.aforoMax,
        tiempo_limpieza_min: dto.tiempoLimpiezaMin ?? 45,
        activo: true,
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
    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.aforoMax !== undefined) cambios.aforo_max = dto.aforoMax;
    if (dto.tiempoLimpiezaMin !== undefined) cambios.tiempo_limpieza_min = dto.tiempoLimpiezaMin;
    if (dto.activo !== undefined) cambios.activo = dto.activo;

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

  // ---------- Tarifas ----------

  async crearTarifa(client: SupabaseClient, hotelId: string, dto: CrearTarifaDto) {
    const { data: tipo, error: tipoError } = await client
      .from('tipos_habitacion')
      .select('id')
      .eq('id', dto.tipoHabId)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (tipoError) throw tipoError;
    if (!tipo) throw new NotFoundException('El tipo de habitación no existe en este hotel');

    const { data, error } = await client
      .from('tarifas')
      .insert({
        hotel_id: hotelId,
        tipo_hab_id: dto.tipoHabId,
        minimo: dto.minimo ?? null,
        normal: dto.normal,
        booking: dto.booking ?? null,
        airbnb: dto.airbnb ?? null,
        vigente_desde: dto.vigenteDesde ?? new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listarTarifas(client: SupabaseClient, hotelId: string, tipoHabId?: string) {
    let query = client
      .from('tarifas')
      .select('*, tipos_habitacion(nombre)')
      .eq('hotel_id', hotelId)
      .order('vigente_desde', { ascending: false });

    if (tipoHabId) query = query.eq('tipo_hab_id', tipoHabId);

    const { data, error } = await query;
    if (error) throw error;
    return data;
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
