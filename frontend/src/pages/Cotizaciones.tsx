import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { EstadoBadge } from './Reservas';

interface Cotizacion {
  id: string;
  fecha_emision: string;
  fecha_desde: string;
  fecha_hasta: string;
  estado: string;
  total_estimado: number | null;
  moneda: string;
  totalPersonas: number;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
}

const ESTADOS = ['pendiente', 'aprobada', 'convertida', 'vencida', 'cancelada'];

function fmt(n: number): string {
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hoyYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioDeMes(fechaYMD: string): string {
  return `${fechaYMD.slice(0, 7)}-01`;
}

export function Cotizaciones() {
  const { hotelActual } = useHotel();
  const navigate = useNavigate();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(() => inicioDeMes(hoyYMD()));
  const [filtroHasta, setFiltroHasta] = useState(hoyYMD);
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroBusquedaAplicada, setFiltroBusquedaAplicada] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce igual que en Reservas.tsx/Estadias.tsx: evita mandar una
  // consulta por cada tecla mientras se escribe el nombre a buscar.
  useEffect(() => {
    const t = setTimeout(() => setFiltroBusquedaAplicada(filtroBusqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [filtroBusqueda]);

  function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroEstado) params.set('estado', filtroEstado);
    if (filtroDesde) params.set('desde', filtroDesde);
    if (filtroHasta) params.set('hasta', filtroHasta);
    if (filtroBusquedaAplicada) params.set('busqueda', filtroBusquedaAplicada);
    const query = params.toString() ? `?${params.toString()}` : '';
    api
      .get<Cotizacion[]>(`/hoteles/${hotelActual.hotelId}/cotizaciones${query}`)
      .then(setCotizaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, [hotelActual, filtroEstado, filtroDesde, filtroHasta, filtroBusquedaAplicada]);

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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', margin: '16px 0' }}>
        <div>
          <label style={labelStyle}>Estado</label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={selectStyle}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Fecha desde</label>
          <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Fecha hasta</label>
          <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ minWidth: 180 }}>
          <label style={labelStyle}>Nombre</label>
          <input
            value={filtroBusqueda}
            onChange={(e) => setFiltroBusqueda(e.target.value)}
            style={inputStyle}
            placeholder="Huésped o empresa"
          />
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', border: '2px solid var(--table-header-border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: 12 }}>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Fecha</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Personas</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Importe total</th>
                <th style={thStyle}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cotizaciones/${c.id}`)}
                  style={{ cursor: 'pointer', background: i % 2 === 1 ? 'var(--surface-0)' : 'var(--surface-1)' }}
                >
                  <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {c.huespedes ? `${c.huespedes.nombres} ${c.huespedes.apellidos}` : (c.empresas?.razon_social ?? '—')}
                  </td>
                  <td style={tdStyle}>{new Date(c.fecha_emision).toLocaleDateString('es-PE')}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.totalPersonas}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                    {c.moneda} {fmt(c.total_estimado ?? 0)}
                  </td>
                  <td style={tdStyle}>
                    <EstadoBadge estado={c.estado} />
                  </td>
                </tr>
              ))}
              {cotizaciones.length === 0 && (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    No hay cotizaciones para estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: '10px 10px',
  fontWeight: 700,
  color: 'var(--table-header-text)',
  background: 'var(--table-header-bg)',
  borderRight: '2px solid var(--table-header-border)',
  borderBottom: '2px solid var(--table-header-border)',
};

const tdStyle: CSSProperties = {
  padding: '9px 10px',
  color: 'var(--text-secondary)',
  borderRight: '2px solid var(--table-border)',
  borderBottom: '2px solid var(--table-border)',
};

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const selectStyle: CSSProperties = { ...inputStyle };

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 3,
};
