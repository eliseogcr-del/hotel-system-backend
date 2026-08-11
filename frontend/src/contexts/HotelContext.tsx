import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface AsignacionHotel {
  hotelId: string;
  nombre: string;
  rol: 'admin' | 'recepcion' | 'hk';
}

interface HotelContextValue {
  asignaciones: AsignacionHotel[];
  hotelActual: AsignacionHotel | null;
  cambiarHotel: (hotelId: string) => void;
  loading: boolean;
  personalNombre: string | null;
}

const HotelContext = createContext<HotelContextValue | null>(null);

export function HotelProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [asignaciones, setAsignaciones] = useState<AsignacionHotel[]>([]);
  const [personalNombre, setPersonalNombre] = useState<string | null>(null);
  const [hotelActualId, setHotelActualId] = useState<string | null>(
    localStorage.getItem('hotelActualId'),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setAsignaciones([]);
      setPersonalNombre(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      // Mismas policies de RLS que ya se probaron en el backend: cada
      // quien lee su propia fila de personal + sus propias asignaciones.
      const { data: personal } = await supabase
        .from('personal')
        .select('id, nombre')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (!personal) {
        setAsignaciones([]);
        setPersonalNombre(null);
        setLoading(false);
        return;
      }
      setPersonalNombre(personal.nombre);

      const { data: ph } = await supabase
        .from('personal_hotel')
        .select('hotel_id, rol, hoteles(nombre)')
        .eq('personal_id', personal.id)
        .eq('activo', true);

      const lista: AsignacionHotel[] = (ph ?? []).map((row: any) => ({
        hotelId: row.hotel_id,
        rol: row.rol,
        nombre: row.hoteles?.nombre ?? 'Hotel',
      }));

      setAsignaciones(lista);
      setHotelActualId((actual) => actual && lista.some((a) => a.hotelId === actual)
        ? actual
        : lista[0]?.hotelId ?? null);
      setLoading(false);
    })();
  }, [session]);

  function cambiarHotel(hotelId: string) {
    setHotelActualId(hotelId);
    localStorage.setItem('hotelActualId', hotelId);
  }

  const hotelActual = asignaciones.find((a) => a.hotelId === hotelActualId) ?? null;

  return (
    <HotelContext.Provider value={{ asignaciones, hotelActual, cambiarHotel, loading, personalNombre }}>
      {children}
    </HotelContext.Provider>
  );
}

export function useHotel() {
  const ctx = useContext(HotelContext);
  if (!ctx) throw new Error('useHotel debe usarse dentro de HotelProvider');
  return ctx;
}
