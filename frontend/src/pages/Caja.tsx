import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface Turno {
  id: string;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
}

interface MovimientoCaja {
  id: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  concepto: string;
  metodo_pago: string;
  created_at: string;
}

interface SesionCaja {
  id: string;
  fecha: string;
  saldo_inicial: number;
  saldo_final: number | null;
  estado: 'abierta' | 'cerrada';
  abierta_en: string;
  cerrada_en: string | null;
  movimientos: MovimientoCaja[];
  totalIngresos: number;
  totalEgresos: number;
  saldoActual: number;
}

const METODOS = ['efectivo', 'transferencia', 'yape', 'tarjeta'];

export function Caja() {
  const { hotelActual } = useHotel();
  const [sesion, setSesion] = useState<SesionCaja | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [turnoId, setTurnoId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);

  function cargarSesionActual() {
    if (!hotelActual) return;
    setLoading(true);
    api
      .get<SesionCaja>(`/hoteles/${hotelActual.hotelId}/caja/actual`)
      .then(setSesion)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setSesion(null);
        } else {
          setError(err instanceof ApiError ? err.message : 'Error al cargar');
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(cargarSesionActual, [hotelActual]);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<Turno[]>(`/hoteles/${hotelActual.hotelId}/caja/turnos`)
      .then(setTurnos)
      .catch(() => {});
  }, [hotelActual]);

  async function abrirTurno(e: FormEvent) {
    e.preventDefault();
    if (!hotelActual || !turnoId) return;
    setAccionando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/caja/abrir`, { turnoId });
      cargarSesionActual();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir el turno');
    } finally {
      setAccionando(false);
    }
  }

  async function cerrarTurno() {
    if (!hotelActual || !sesion) return;
    if (!confirm('¿Seguro que quieres cerrar tu turno? No podrás registrar más movimientos.')) return;
    setAccionando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/caja/sesiones/${sesion.id}/cerrar`);
      cargarSesionActual();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cerrar el turno');
    } finally {
      setAccionando(false);
    }
  }

  if (!hotelActual) return null;
  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>;

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Caja</h1>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {!sesion ? (
        <form
          onSubmit={abrirTurno}
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            maxWidth: 360,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            No tienes una sesión de turno abierta.
          </p>
          <label style={labelStyle}>Turno</label>
          <select value={turnoId} onChange={(e) => setTurnoId(e.target.value)} style={inputStyle} required>
            <option value="">Selecciona...</option>
            {turnos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} ({t.hora_inicio}–{t.hora_fin})
              </option>
            ))}
          </select>
          <button type="submit" disabled={accionando} style={{ ...btnPrimary, marginTop: 12, width: '100%' }}>
            Abrir turno
          </button>
        </form>
      ) : (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <MetricCard label="Saldo inicial" value={`PEN ${sesion.saldo_inicial}`} />
            <MetricCard label="Ingresos" value={`PEN ${sesion.totalIngresos}`} />
            <MetricCard label="Egresos" value={`PEN ${sesion.totalEgresos}`} />
            <MetricCard label="Saldo actual" value={`PEN ${sesion.saldoActual}`} destacado />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Abierta {new Date(sesion.abierta_en).toLocaleString()}
            </span>
            <button onClick={cerrarTurno} disabled={accionando} style={btnDanger}>
              Cerrar turno
            </button>
          </div>

          <RegistrarMovimientoForm
            hotelId={hotelActual.hotelId}
            sesionId={sesion.id}
            onRegistrado={cargarSesionActual}
          />

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16, minWidth: 560 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Concepto</th>
                  <th style={thStyle}>Método</th>
                  <th style={thStyle}>Monto</th>
                  <th style={thStyle}>Hora</th>
                </tr>
              </thead>
              <tbody>
                {sesion.movimientos.map((m) => (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <span style={{ color: m.tipo === 'ingreso' ? 'var(--disponible)' : 'var(--danger)' }}>
                        {m.tipo}
                      </span>
                    </td>
                    <td style={tdStyle}>{m.concepto}</td>
                    <td style={tdStyle}>{m.metodo_pago}</td>
                    <td style={tdStyle}>{m.monto}</td>
                    <td style={tdStyle}>{new Date(m.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sesion.movimientos.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay movimientos en este turno.</p>
          )}
        </div>
      )}
    </div>
  );
}

function RegistrarMovimientoForm({
  hotelId,
  sesionId,
  onRegistrado,
}: {
  hotelId: string;
  sesionId: string;
  onRegistrado: () => void;
}) {
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('egreso');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/caja/sesiones/${sesionId}/movimientos`, {
        tipo,
        monto: Number(monto),
        concepto,
        metodoPago,
      });
      setMonto('');
      setConcepto('');
      onRegistrado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ width: 150 }}>
        <label style={labelStyle}>Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as 'ingreso' | 'egreso')} style={inputStyle}>
          <option value="egreso">Egreso (gasto)</option>
          <option value="ingreso">Ingreso</option>
        </select>
      </div>
      <div style={{ width: 100 }}>
        <label style={labelStyle}>Monto</label>
        <input type="number" min={0.01} step={0.01} value={monto} onChange={(e) => setMonto(e.target.value)} style={inputStyle} required />
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={labelStyle}>Concepto</label>
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} style={inputStyle} required />
      </div>
      <div style={{ width: 130 }}>
        <label style={labelStyle}>Método</label>
        <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={inputStyle}>
          {METODOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Guardando...' : 'Registrar'}
      </button>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, width: '100%' }}>{error}</p>}
    </form>
  );
}

function MetricCard({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div
      style={{
        background: destacado ? 'var(--brand-bg)' : 'var(--surface-1)',
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        flex: '1 1 130px',
        minWidth: 130,
      }}
    >
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 500, margin: '4px 0 0', color: destacado ? 'var(--brand)' : 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

const thStyle: CSSProperties = { padding: '6px 8px' };
const tdStyle: CSSProperties = { padding: '8px', color: 'var(--text-secondary)' };

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  width: '100%',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 3,
};

const btnPrimary: CSSProperties = {
  padding: '8px 14px',
  background: 'var(--brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  fontWeight: 500,
};

const btnDanger: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--ocupada)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};
