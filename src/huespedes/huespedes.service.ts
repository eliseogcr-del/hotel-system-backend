import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CrearHuespedDto } from './dto/crear-huesped.dto';
import { ActualizarHuespedDto } from './dto/actualizar-huesped.dto';
import { ListarHuespedesQueryDto } from './dto/listar-huespedes-query.dto';

const CODIGO_UNIQUE_VIOLATION = '23505';

@Injectable()
export class HuespedesService {
  async crear(client: SupabaseClient, hotelId: string, dto: CrearHuespedDto) {
    const { data, error } = await client
      .from('huespedes')
      .insert({
        hotel_id: hotelId,
        tipo_doc: dto.tipoDoc,
        nro_doc: dto.nroDoc,
        nombres: dto.nombres,
        apellidos: dto.apellidos,
        nacionalidad: dto.nacionalidad ?? null,
        origen: dto.origen ?? null,
        fecha_nacimiento: dto.fechaNacimiento ?? null,
        telefono: dto.telefono ?? null,
        correo: dto.correo ?? null,
        ruc: dto.ruc ?? null,
        razon_social: dto.razonSocial ?? null,
      })
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
        throw new ConflictException('Ya existe un huésped con ese tipo y número de documento en este hotel');
      }
      throw error;
    }
    return data;
  }

  async listar(client: SupabaseClient, hotelId: string, query: ListarHuespedesQueryDto) {
    let consulta = client
      .from('huespedes')
      .select('*')
      .eq('hotel_id', hotelId)
      .order('nombres', { ascending: true })
      .limit(200);

    const buscar = query.buscar?.trim().replace(/[,()%]/g, '');
    if (buscar) {
      consulta = consulta.or(
        `nombres.ilike.%${buscar}%,apellidos.ilike.%${buscar}%,nro_doc.ilike.%${buscar}%,ruc.ilike.%${buscar}%,razon_social.ilike.%${buscar}%`,
      );
    }

    const { data, error } = await consulta;
    if (error) throw error;
    return data;
  }

  async obtenerDetalle(client: SupabaseClient, hotelId: string, id: string) {
    const { data, error } = await client
      .from('huespedes')
      .select('*')
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Huésped no encontrado en este hotel');
    return data;
  }

  async actualizar(client: SupabaseClient, hotelId: string, id: string, dto: ActualizarHuespedDto) {
    const cambios: Record<string, unknown> = {};
    if (dto.tipoDoc !== undefined) cambios.tipo_doc = dto.tipoDoc;
    if (dto.nroDoc !== undefined) cambios.nro_doc = dto.nroDoc;
    if (dto.nombres !== undefined) cambios.nombres = dto.nombres;
    if (dto.apellidos !== undefined) cambios.apellidos = dto.apellidos;
    if (dto.nacionalidad !== undefined) cambios.nacionalidad = dto.nacionalidad;
    if (dto.origen !== undefined) cambios.origen = dto.origen;
    if (dto.fechaNacimiento !== undefined) cambios.fecha_nacimiento = dto.fechaNacimiento;
    if (dto.telefono !== undefined) cambios.telefono = dto.telefono;
    if (dto.correo !== undefined) cambios.correo = dto.correo;
    if (dto.ruc !== undefined) cambios.ruc = dto.ruc;
    if (dto.razonSocial !== undefined) cambios.razon_social = dto.razonSocial;

    const { data, error } = await client
      .from('huespedes')
      .update(cambios)
      .eq('id', id)
      .eq('hotel_id', hotelId)
      .select()
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
        throw new ConflictException('Ya existe un huésped con ese tipo y número de documento en este hotel');
      }
      throw error;
    }
    if (!data) throw new NotFoundException('Huésped no encontrado en este hotel');
    return data;
  }
}
