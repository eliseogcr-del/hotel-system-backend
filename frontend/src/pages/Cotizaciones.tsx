import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { EstadoBadge } from './Reservas';

interface Cotizacion {
  id: string;
  fecha_desde: string;
  fecha_hasta: string;
  estado: string;
  total_estimado: number | null;
  moneda: string;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
}

const ESTADOS = ['pendiente', 'aprobada', 'convertida', 'vencida', 'cancelada'];

export function Cotizaciones() {
  const { hotelActual } = useHotel();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    const query = filtroEstado ? `?estado=${filtroEstado}` : '';
    api
      .get<Cotizacion[]>(`/hoteles/${hotelActual.hotelId}/cotizaciones${query}`)
      .then(setCotizaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, [hotelActual, filtroEstado]);

  if (!hotelActual) return null;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Cotizaciones</h1>
        <Link
          to="/cotizaciones/nueva"
          style={{
            padding: '8px 14px',
            background: 'var(--brand)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          + Nueva cotización
        </Link>
      </div>

      <select
        value={filtroEstado}
        onChange={(e) => setFiltroEstado(e.target.value)}
        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, margin: '16px 0' }}
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

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cotizaciones.map((c) => (
            <Link
              key={c.id}
              to={`/cotizaciones/${c.id}`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '4px 12px',
                padding: '10px 14px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                textDecoration: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <span>{c.huespedes ? `${c.huespedes.nombres} ${c.huespedes.apellidos}` : c.empresas?.razon_social ?? '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {new Date(c.fecha_desde).toLocaleDateString()} → {new Date(c.fecha_hasta).toLocaleDateString()}
              </span>
              <span style={{ fontWeight: 500 }}>{c.moneda} {c.total_estimado ?? 0}</span>
              <EstadoBadge estado={c.estado} />
            </Link>
          ))}
          {cotizaciones.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay cotizaciones.</p>}
        </div>
      )}
    </div>
  );
}
