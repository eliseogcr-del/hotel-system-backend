import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { UpsertTipoCambioDto } from './dto/upsert-tipo-cambio.dto';

@Injectable()
export class TipoCambioService {
  // "Crear" es un upsert por fecha (la fecha es la llave primaria): el
  // admin puede corregir el tipo de cambio del día si se equivocó, sin
  // que eso viole la unicidad de fecha.
  async upsert(client: SupabaseClient, dto: UpsertTipoCambioDto) {
    const { data, error } = await client
      .from('tipo_cambio')
      .upsert(
        { fecha: dto.fecha, valor_compra: dto.valorCompra, valor_venta: dto.valorVenta },
        { onConflict: 'fecha' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listar(client: SupabaseClient, limite = 30) {
    const { data, error } = await client
      .from('tipo_cambio')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data;
  }

  // El más reciente registrado, sea o no el de hoy -- si el admin no cargó
  // el de hoy todavía, es mejor mostrar el último conocido (con su fecha
  // real y visible) que no mostrar nada.
  async obtenerVigente(client: SupabaseClient) {
    const { data, error } = await client
      .from('tipo_cambio')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
