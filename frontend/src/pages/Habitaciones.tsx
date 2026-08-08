import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface Habitacion {
  id: string;
  hab_numero: number;
  piso: number;
  estado: 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' | 'bloqueada';
  tipos_habitacion: { nombre: string } | null;
  proximaReserva: { fecha_hora_checkin_prevista: string } | null;
}

const ESTADO_LABEL: Record<Habitacion['estado'], string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
  limpieza: 'Limpieza',
  mantenimiento: 'Mantenimiento',
  bloqueada: 'Bloqueada',
};

export function Habitaciones() {
  const { hotelActual } = useHotel();
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelActual) return;
    setLoading(true);
    setError(null);

    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [hotelActual]);

  if (!hotelActual) return <p style={{ color: 'var(--text-muted)' }}>Cargando hotel...</p>;
  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Cargando habitaciones...</p>;
  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Habitaciones</h1>

      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {(Object.keys(ESTADO_LABEL) as Habitacion['estado'][]).map((estado) => (
          <span key={estado} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: `var(--${estado})`,
                display: 'inline-block',
              }}
            />
            {ESTADO_LABEL[estado]}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: 10,
        }}
      >
        {habitaciones.map((h) => (
          <div
            key={h.id}
            style={{
              background: `var(--${h.estado}-bg)`,
              color: `var(--${h.estado}-text)`,
              borderRadius: 'var(--radius)',
              padding: '12px 10px',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{h.hab_numero}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, opacity: 0.85 }}>
              {h.tipos_habitacion?.nombre ?? '—'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 10, opacity: 0.75 }}>
              {ESTADO_LABEL[h.estado]}
            </p>
          </div>
        ))}
      </div>

      {habitaciones.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No hay habitaciones registradas.</p>
      )}
    </div>
  );
}
