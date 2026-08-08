import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { CheckinRapidoModal } from '../components/CheckinRapidoModal';

type Estado = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' | 'bloqueada';

interface Habitacion {
  id: string;
  hab_numero: number;
  piso: number;
  estado: Estado;
  mantenimiento_planificado: boolean;
  tipos_habitacion: { id: string; nombre: string } | null;
  estadiaId: string | null;
  huesped: string | null;
  checkinReal: string | null;
  checkoutPrevisto: string | null;
  tarifaDia: number | null;
  totalAlquiler: number | null;
  totalOtrosServicios: number | null;
  totalPagado: number | null;
  saldo: number | null;
  notas: string | null;
}

interface TipoHabitacionPrecios {
  id: string;
  precio_normal: number;
  precio_corporativo: number;
  precio_web: number;
  precio_por_hora: number | null;
  precio_costo: number;
}

const ESTADO_LABEL: Record<Estado, string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
  limpieza: 'Limpieza',
  mantenimiento: 'Mantenimiento',
  bloqueada: 'Bloqueada',
};

function formatoFechaHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function formatoMonto(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Habitaciones() {
  const { hotelActual } = useHotel();
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [tiposHabitacion, setTiposHabitacion] = useState<TipoHabitacionPrecios[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(new Date());
  const [checkinHab, setCheckinHab] = useState<Habitacion | null>(null);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    setError(null);
    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
    api
      .get<TipoHabitacionPrecios[]>(`/hoteles/${hotelActual.hotelId}/tipos-habitacion`)
      .then(setTiposHabitacion)
      .catch(() => {});
  }

  useEffect(cargar, [hotelActual]);

  async function guardarNotas(hab: Habitacion, notas: string) {
    if (!hotelActual || !hab.estadiaId) return;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/estadias/${hab.estadiaId}/notas`, { notas });
      setHabitaciones((prev) => prev.map((h) => (h.id === hab.id ? { ...h, notas } : h)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar las notas');
    }
  }

  async function alternarMantenimientoPlanificado(hab: Habitacion) {
    if (!hotelActual || hab.estado !== 'ocupada') return;
    const nuevo = !hab.mantenimiento_planificado;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/habitaciones/${hab.id}/mantenimiento`, {
        activar: nuevo,
      });
      setHabitaciones((prev) =>
        prev.map((h) => (h.id === hab.id ? { ...h, mantenimiento_planificado: nuevo } : h)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  function preciosDe(tipoId: string | undefined): TipoHabitacionPrecios | null {
    if (!tipoId) return null;
    return tiposHabitacion.find((t) => t.id === tipoId) ?? null;
  }

  if (!hotelActual) return <p style={{ color: 'var(--text-muted)' }}>Cargando hotel...</p>;
  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Cargando habitaciones...</p>;
  if (error && habitaciones.length === 0) return <p style={{ color: 'var(--danger)' }}>{error}</p>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Habitaciones</h1>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
          {ahora.toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'medium' })}
        </span>
        <span />
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {(Object.keys(ESTADO_LABEL) as Estado[]).map((estado) => (
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

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1400 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11, background: 'var(--surface-1)' }}>
              <th style={thStyle}>N°</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Huésped</th>
              <th style={thStyle}>Check-in real</th>
              <th style={thStyle}>Salida programada</th>
              <th style={thStyle}>Alquiler</th>
              <th style={thStyle}>Otros servicios</th>
              <th style={thStyle}>Pagado</th>
              <th style={thStyle}>Adeudado</th>
              <th style={thStyle}>Tarifa/día</th>
              <th style={thStyle}>Notas</th>
              <th style={thStyle}>¿Mantenim.?</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {habitaciones.map((h) => (
              <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>{h.hab_numero}</td>
                <td style={tdStyle}>{h.tipos_habitacion?.nombre ?? '—'}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      background: `var(--${h.estado}-bg)`,
                      color: `var(--${h.estado}-text)`,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                    }}
                  >
                    {ESTADO_LABEL[h.estado]}
                  </span>
                </td>
                <td style={tdStyle}>{h.huesped ?? ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoFechaHora(h.checkinReal) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoFechaHora(h.checkoutPrevisto) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalAlquiler) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalOtrosServicios) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalPagado) : ''}</td>
                <td
                  style={{
                    ...tdStyle,
                    ...(h.huesped && h.saldo != null && h.saldo > 0
                      ? { background: 'var(--ocupada-bg)', color: 'var(--ocupada-text)', fontWeight: 500 }
                      : {}),
                  }}
                >
                  {h.huesped ? formatoMonto(h.saldo) : ''}
                </td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.tarifaDia) : ''}</td>
                <td style={tdStyle}>
                  {h.huesped ? (
                    <NotasCelda notas={h.notas ?? ''} onGuardar={(n) => guardarNotas(h, n)} />
                  ) : (
                    ''
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={h.mantenimiento_planificado}
                    disabled={h.estado !== 'ocupada'}
                    title={h.estado !== 'ocupada' ? 'Solo se puede marcar mientras la habitación está ocupada' : ''}
                    onChange={() => alternarMantenimientoPlanificado(h)}
                  />
                </td>
                <td style={tdStyle}>
                  {h.estado === 'disponible' && (
                    <button onClick={() => setCheckinHab(h)} style={linkBtnStyle}>
                      Check-in
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {habitaciones.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No hay habitaciones registradas.</p>
      )}

      {checkinHab && (
        <CheckinRapidoModal
          hotelId={hotelActual.hotelId}
          habitacionId={checkinHab.id}
          habNumero={checkinHab.hab_numero}
          precios={preciosDe(checkinHab.tipos_habitacion?.id)}
          onClose={() => setCheckinHab(null)}
          onCreado={cargar}
        />
      )}
    </div>
  );
}

function NotasCelda({ notas, onGuardar }: { notas: string; onGuardar: (valor: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(notas);

  useEffect(() => setValor(notas), [notas]);

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          fontSize: 12.5,
          color: notas ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: 'pointer',
          maxWidth: 180,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'block',
        }}
        title={notas || 'Agregar nota'}
      >
        {notas || '+ nota'}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => {
        setEditando(false);
        if (valor !== notas) onGuardar(valor);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValor(notas);
          setEditando(false);
        }
      }}
      style={{
        width: 160,
        padding: '3px 6px',
        border: '1px solid var(--border-strong)',
        borderRadius: 4,
        fontSize: 12.5,
      }}
    />
  );
}

const thStyle: CSSProperties = { padding: '8px 10px', whiteSpace: 'nowrap' };
const tdStyle: CSSProperties = { padding: '8px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' };

const linkBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--brand)',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'underline',
};
