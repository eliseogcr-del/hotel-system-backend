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

  // authUserId (no el objeto session completo): Supabase entrega un objeto
  // `session` NUEVO en cada refresh silencioso de token (incluso para el
  // mismo usuario, ver AuthContext.tsx) -- si este efecto dependiera de
  // `session` por referencia, se repetiría el fetch de personal/asignaciones
  // cada vez que alguien vuelve de otra pestaña, y `hotelActual` (recalculado
  // de `asignaciones.find(...)`) sería un objeto nuevo cada vez, disparando
  // en cascada los useEffect de TODAS las páginas que dependen de
  // `hotelActual` (Reservas, Habitaciones, Estadías, etc.) sin que haya
  // nada que realmente cambió.
  const authUserId = session?.user.id ?? null;

  useEffect(() => {
    if (!authUserId) {
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
        .select('id, nombre, organizacion_id, es_admin_organizacion')
        .eq('auth_user_id', authUserId)
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

      // Admin de organización: ve TODOS los hoteles de su organización, no
      // solo los que tiene en personal_hotel (mismo criterio que
      // AuthGuard.ts del lado del backend -- ver migracion_organizaciones.sql).
      if (personal.es_admin_organizacion && personal.organizacion_id) {
        const { data: hotelesOrg } = await supabase
          .from('hoteles')
          .select('id, nombre')
          .eq('organizacion_id', personal.organizacion_id);
        const idsExistentes = new Set(lista.map((a) => a.hotelId));
        for (const h of hotelesOrg ?? []) {
          if (!idsExistentes.has(h.id)) {
            lista.push({ hotelId: h.id, rol: 'admin', nombre: h.nombre });
          }
        }
      }

      setAsignaciones(lista);
      setHotelActualId((actual) => actual && lista.some((a) => a.hotelId === actual)
        ? actual
        : lista[0]?.hotelId ?? null);
      setLoading(false);
    })();
  }, [authUserId]);

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
