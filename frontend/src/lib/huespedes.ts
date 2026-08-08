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
  fecha_nacimiento: string | null;
}

// No hay HuespedesModule en el backend todavía, así que esto consulta
// Supabase directo desde el frontend — seguro porque `huespedes` ya tiene
// RLS 'for all' scoped por hotel_id (misma política que ya se probó desde
// el backend). Mismo patrón que HotelContext usa para personal_hotel.
export async function buscarHuespedPorDni(
  hotelId: string,
  nroDoc: string,
): Promise<Huesped | null> {
  const { data, error } = await supabase
    .from('huespedes')
    .select('id, nombres, apellidos, tipo_doc, nro_doc, telefono, correo, nacionalidad, fecha_nacimiento')
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
    .select('id, nombres, apellidos, tipo_doc, nro_doc, telefono, correo, nacionalidad, fecha_nacimiento')
    .single();
  if (error) throw error;
  return data;
}
