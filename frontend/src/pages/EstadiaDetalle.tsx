import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface MovimientoCuenta {
  id: string;
  tipo: string;
  monto: number;
  metodo_pago: string | null;
  fecha: string;
  notas: string | null;
}

interface EstadiaDetalleData {
  id: string;
  estado_actual: string;
  saldo: number;
  checkin_real: string | null;
  checkout_real: string | null;
  movimientos: MovimientoCuenta[];
  reserva_habitacion: {
    habitaciones: { hab_numero: number; piso: number } | null;
    reservas: { huespedes: { nombres: string; apellidos: string } | null } | null;
  };
}

const TIPOS_MOVIMIENTO = ['pago', 'ajuste', 'early', 'late', 'cochera'];
const METODOS = ['efectivo', 'transferencia', 'yape', 'tarjeta'];

export function EstadiaDetalle() {
  const { id } = useParams<{ id: string }>();
  const { hotelActual } = useHotel();
  const [estadia, setEstadia] = useState<EstadiaDetalleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);

  function cargar() {
    if (!hotelActual || !id) return;
    api
      .get<EstadiaDetalleData>(`/hoteles/${hotelActual.hotelId}/estadias/${id}`)
      .then(setEstadia)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'));
  }

  useEffect(cargar, [hotelActual, id]);

  async function checkout() {
    if (!hotelActual || !id) return;
    if (!confirm('¿Confirmar checkout? La habitación pasará a limpieza.')) return;
    setAccionando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/estadias/${id}/checkout`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo hacer el checkout');
    } finally {
      setAccionando(false);
    }
  }

  if (!hotelActual) return null;
  if (error && !estadia) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!estadia) return <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>;

  return (
    <div>
      <Link to="/estadias" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        ← Volver a estadías
      </Link>

      <div style={{ margin: '12px 0 20px' }}>
        <h1 style={{ fontSize: 20 }}>
          Habitación {estadia.reserva_habitacion.habitaciones?.hab_numero} ·{' '}
          {estadia.reserva_habitacion.reservas?.huespedes
            ? `${estadia.reserva_habitacion.reservas.huespedes.nombres} ${estadia.reserva_habitacion.reservas.huespedes.apellidos}`
            : '—'}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Estado: {estadia.estado_actual} · Saldo: PEN {estadia.saldo}
        </p>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {estadia.estado_actual === 'en_curso' && (
        <button onClick={checkout} disabled={accionando} style={{ ...btnPrimary, marginBottom: 20 }}>
          Hacer checkout
        </button>
      )}

      {estadia.estado_actual !== 'finalizada' && (
        <RegistrarMovimientoForm
          hotelId={hotelActual.hotelId}
          estadiaId={estadia.id}
          onRegistrado={cargar}
        />
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
            <th style={thStyle}>Tipo</th>
            <th style={thStyle}>Monto</th>
            <th style={thStyle}>Método</th>
            <th style={thStyle}>Fecha</th>
            <th style={thStyle}>Notas</th>
          </tr>
        </thead>
        <tbody>
          {estadia.movimientos.map((m) => (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={tdStyle}>{m.tipo}</td>
              <td style={{ ...tdStyle, color: Number(m.monto) < 0 ? 'var(--disponible)' : 'var(--text-secondary)' }}>
                {m.monto}
              </td>
              <td style={tdStyle}>{m.metodo_pago ?? '—'}</td>
              <td style={tdStyle}>{new Date(m.fecha).toLocaleString()}</td>
              <td style={tdStyle}>{m.notas ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegistrarMovimientoForm({
  hotelId,
  estadiaId,
  onRegistrado,
}: {
  hotelId: string;
  estadiaId: string;
  onRegistrado: () => void;
}) {
  const [tipo, setTipo] = useState('pago');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [notas, setNotas] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/estadias/${estadiaId}/movimientos`, {
        tipo,
        monto: Number(monto),
        metodoPago: tipo === 'pago' ? metodoPago : undefined,
        notas: notas || undefined,
      });
      setMonto('');
      setNotas('');
      onRegistrado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento');
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
      <div>
        <label style={labelStyle}>Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={inputStyle}>
          {TIPOS_MOVIMIENTO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div style={{ width: 100 }}>
        <label style={labelStyle}>Monto</label>
        <input type="number" min={0.01} step={0.01} value={monto} onChange={(e) => setMonto(e.target.value)} style={inputStyle} required />
      </div>
      {tipo === 'pago' && (
        <div>
          <label style={labelStyle}>Método</label>
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={inputStyle}>
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 140 }}>
        <label style={labelStyle}>Notas</label>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} style={inputStyle} />
      </div>
      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Guardando...' : 'Registrar'}
      </button>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, width: '100%' }}>{error}</p>}
    </form>
  );
}

const thStyle: CSSProperties = { padding: '6px 8px' };
const tdStyle: CSSProperties = { padding: '8px', color: 'var(--text-secondary)' };

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
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
