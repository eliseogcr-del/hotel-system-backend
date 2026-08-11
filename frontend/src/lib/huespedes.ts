import { supabase } from './supabase';

export interface Huesped {
  id: string;
  nombres: string;
  apellidos: string;
  tipo_doc: string;
  nro_doc: string;
  telefono: string | null;
  correo: string | null;
  nacionalidad: string | null;
  origen: string | null;
  fecha_nacimiento: string | null;
  ruc: string | null;
  razon_social: string | null;
}

const HUESPED_SELECT =
  'id, nombres, apellidos, tipo_doc, nro_doc, telefono, correo, nacionalidad, origen, fecha_nacimiento, ruc, razon_social';

// Búsqueda rápida durante check-in/reservas: consulta Supabase directo
// desde el frontend en vez de pasar por HuespedesModule -- seguro porque
// `huespedes` ya tiene RLS 'for all' scoped por hotel_id (misma política
// que ya se probó desde el backend). Mismo patrón que HotelContext usa
// para personal_hotel. La pantalla /huespedes (alta/edición completa) sí
// pasa por el backend; esto es solo para el atajo de "buscar por DNI".
export async function buscarHuespedPorDni(
  hotelId: string,
  nroDoc: string,
): Promise<Huesped | null> {
  const { data, error } = await supabase
    .from('huespedes')
    .select(HUESPED_SELECT)
    .eq('hotel_id', hotelId)
    .eq('nro_doc', nroDoc)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function crearHuesped(
  hotelId: string,
  datos: { nombres: string; apellidos: string; tipoDoc: string; nroDoc: string },
): Promise<Huesped> {
  const { data, error } = await supabase
    .from('huespedes')
    .insert({
      hotel_id: hotelId,
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      tipo_doc: datos.tipoDoc,
      nro_doc: datos.nroDoc,
    })
    .select(HUESPED_SELECT)
    .single();
  if (error) throw error;
  return data;
}

// A veces el cliente solo da su nombre (o apellido) por teléfono -- búsqueda
// parcial sobre nombres/apellidos, puede devolver varias coincidencias
// (ej. "RIOS" matchea a cualquier huésped que tenga eso en cualquiera de
// los dos campos) para que el recepcionista elija cuál es.
export async function buscarHuespedesPorNombre(hotelId: string, texto: string): Promise<Huesped[]> {
  const q = texto.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('huespedes')
    .select(HUESPED_SELECT)
    .eq('hotel_id', hotelId)
    .or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%`)
    .order('nombres', { ascending: true })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

export interface Empresa {
  id: string;
  ruc: string;
  razon_social: string;
}

// Reservas a nombre de una empresa (no de un huésped individual): se busca
// por RUC exacto, igual criterio que buscarHuespedPorDni.
export async function buscarEmpresaPorRuc(hotelId: string, ruc: string): Promise<Empresa | null> {
  const { data, error } = await supabase
    .from('empresas')
    .select('id, ruc, razon_social')
    .eq('hotel_id', hotelId)
    .eq('ruc', ruc)
    .maybeSingle();
  if (error) throw error;
  return data;
}
