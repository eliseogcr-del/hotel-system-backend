import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface FilaEstadia {
  id: string;
  tipo_alquiler: string;
  fecha_hora_checkin_prevista: string;
  fecha_hora_checkout_prevista: string;
  habitaciones: { hab_numero: number; piso: number } | null;
  reservas: { huespedes: { nombres: string; apellidos: string } | null } | null;
  estadias: {
    id: string;
    estado_actual: string;
    saldo: number;
    checkin_real: string | null;
    checkout_real: string | null;
  };
}

const ESTADOS = ['pendiente', 'en_curso', 'finalizada'];

export function Estadias() {
  const { hotelActual } = useHotel();
  const [filas, setFilas] = useState<FilaEstadia[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('en_curso');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelActual) return;
    setLoading(true);
    const query = filtroEstado ? `?estado=${filtroEstado}` : '';
    api
      .get<FilaEstadia[]>(`/hoteles/${hotelActual.hotelId}/estadias${query}`)
      .then(setFilas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [hotelActual, filtroEstado]);

  if (!hotelActual) return null;

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Estadías</h1>

      <select
        value={filtroEstado}
        onChange={(e) => setFiltroEstado(e.target.value)}
        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 16 }}
      >
        <option value="">Todos los estados</option>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filas.map((f) => (
            <Link
              key={f.estadias.id}
              to={`/estadias/${f.estadias.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                textDecoration: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <span>
                {f.habitaciones?.hab_numero} ·{' '}
                {f.reservas?.huespedes ? `${f.reservas.huespedes.nombres} ${f.reservas.huespedes.apellidos}` : '—'}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {new Date(f.fecha_hora_checkin_prevista).toLocaleDateString()} → {new Date(f.fecha_hora_checkout_prevista).toLocaleDateString()}
              </span>
              <span style={{ fontWeight: 500 }}>Saldo: PEN {f.estadias.saldo}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.estadias.estado_actual}</span>
            </Link>
          ))}
          {filas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay estadías en este estado.</p>}
        </div>
      )}
    </div>
  );
}
