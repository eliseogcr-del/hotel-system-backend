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
