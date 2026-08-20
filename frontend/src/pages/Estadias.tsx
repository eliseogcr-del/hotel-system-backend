import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface FilaEstadia {
  id: string;
  tipo_alquiler: string;
  incluye_desayuno: boolean;
  tarifa_dia: number;
  fecha_hora_checkin_prevista: string;
  fecha_hora_checkout_prevista: string;
  habitaciones: { hab_numero: number; piso: number } | null;
  reservas: {
    huespedes: {
      nombres: string;
      apellidos: string;
      tipo_doc: string;
      nro_doc: string;
      telefono: string | null;
      ruc: string | null;
      razon_social: string | null;
    } | null;
  } | null;
  estadias: {
    id: string;
    estado_actual: string;
    saldo: number;
    checkin_real: string | null;
    checkout_real: string | null;
  };
}

const ESTADOS = ['pendiente', 'en_curso', 'finalizada'];

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  finalizada: 'Finalizada',
};

function formatoFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function Estadias() {
  const { hotelActual } = useHotel();
  const navigate = useNavigate();
  const [filas, setFilas] = useState<FilaEstadia[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('en_curso');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [habNumero, setHabNumero] = useState('');
  const [habNumeroAplicado, setHabNumeroAplicado] = useState('');
  const [checkinDesde, setCheckinDesde] = useState('');
  const [checkinHasta, setCheckinHasta] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    const t = setTimeout(() => setHabNumeroAplicado(habNumero.trim()), 300);
    return () => clearTimeout(t);
  }, [habNumero]);

  useEffect(() => {
    if (!hotelActual) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filtroEstado) params.set('estado', filtroEstado);
    if (busquedaAplicada) params.set('busqueda', busquedaAplicada);
    if (habNumeroAplicado) params.set('habNumero', habNumeroAplicado);
    if (checkinDesde) params.set('checkinDesde', checkinDesde);
    if (checkinHasta) params.set('checkinHasta', checkinHasta);
    const query = params.toString() ? `?${params.toString()}` : '';
    api
      .get<FilaEstadia[]>(`/hoteles/${hotelActual.hotelId}/estadias${query}`)
      .then(setFilas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [hotelActual, filtroEstado, busquedaAplicada, habNumeroAplicado, checkinDesde, checkinHasta]);

  const filasOrdenadas = useMemo(
    () =>
      [...filas].sort(
        (a, b) => new Date(a.fecha_hora_checkin_prevista).getTime() - new Date(b.fecha_hora_checkin_prevista).getTime(),
      ),
    [filas],
  );

  if (!hotelActual) return null;

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Estadías</h1>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e] ?? e}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por DNI, RUC, empresa, nombre o apellido"
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, minWidth: 260 }}
        />
        <input
          type="number"
          min={1}
          value={habNumero}
          onChange={(e) => setHabNumero(e.target.value)}
          placeholder="N° habitación"
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, width: 120 }}
        />
        <div>
          <label style={labelStyle}>Check-in desde</label>
          <input
            type="date"
            value={checkinDesde}
            onChange={(e) => setCheckinDesde(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}
          />
        </div>
        <div>
          <label style={labelStyle}>Check-in hasta</label>
          <input
            type="date"
            value={checkinHasta}
            onChange={(e) => setCheckinHasta(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}
          />
        </div>
        {(habNumero || checkinDesde || checkinHasta) && (
          <button
            type="button"
            onClick={() => {
              setHabNumero('');
              setCheckinDesde('');
              setCheckinHasta('');
            }}
            style={{ padding: '8px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1180 }}>
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  background: 'var(--surface-1)',
                }}
              >
                <th style={thStyle}>Habitación</th>
                <th style={thStyle}>Huésped</th>
                <th style={thStyle}>DNI</th>
                <th style={thStyle}>Teléfono</th>
                <th style={thStyle}>RUC</th>
                <th style={thStyle}>Empresa</th>
                <th style={thStyle}>Check-in</th>
                <th style={thStyle}>Check-out</th>
                <th style={thStyle}>Desayuno</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Tarifa/día</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Saldo</th>
                <th style={{ ...thStyle, borderRight: 'none' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filasOrdenadas.map((f, i) => (
                <tr
                  key={f.estadias.id}
                  onClick={() => navigate(`/estadias/${f.estadias.id}`)}
                  style={{
                    borderTop: '1px solid var(--border)',
                    background: i % 2 === 1 ? 'var(--surface-1)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {f.habitaciones?.hab_numero ?? '—'}
                  </td>
                  <td style={tdStyle}>
                    {f.reservas?.huespedes ? `${f.reservas.huespedes.nombres} ${f.reservas.huespedes.apellidos}` : '—'}
                  </td>
                  <td style={tdStyle}>{f.reservas?.huespedes?.nro_doc ?? '—'}</td>
                  <td style={tdStyle}>{f.reservas?.huespedes?.telefono || '—'}</td>
                  <td style={tdStyle}>{f.reservas?.huespedes?.ruc || '—'}</td>
                  <td style={tdStyle}>{f.reservas?.huespedes?.razon_social || '—'}</td>
                  <td style={tdStyle}>{formatoFecha(f.fecha_hora_checkin_prevista)}</td>
                  <td style={tdStyle}>{formatoFecha(f.fecha_hora_checkout_prevista)}</td>
                  <td style={tdStyle}>{f.incluye_desayuno ? 'Sí' : 'No'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>PEN {Number(f.tarifa_dia).toFixed(2)}</td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      fontWeight: 500,
                      color: f.estadias.saldo > 0 ? 'var(--ocupada-text)' : 'var(--text-primary)',
                    }}
                  >
                    PEN {Number(f.estadias.saldo).toFixed(2)}
                  </td>
                  <td style={{ ...tdStyle, borderRight: 'none' }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {ESTADO_LABEL[f.estadias.estado_actual] ?? f.estadias.estado_actual}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filasOrdenadas.length === 0 && (
            <p style={{ color: 'var(--text-muted)', padding: 16 }}>No hay estadías en este estado.</p>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: '10px 14px',
  whiteSpace: 'nowrap',
  fontWeight: 600,
  borderRight: '1px solid var(--border)',
};

const tdStyle: CSSProperties = {
  padding: '10px 14px',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  borderRight: '1px solid var(--border)',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 3,
};
