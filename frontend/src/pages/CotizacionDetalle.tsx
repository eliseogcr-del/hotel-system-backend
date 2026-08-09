import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { EstadoBadge } from './Reservas';

interface DetalleLinea {
  id: string;
  nro_personas: number;
  dias: number;
  precio_noche: number;
  subtotal: number;
  habitaciones: { hab_numero: number; tipos_habitacion: { nombre: string } | null } | null;
}

interface CotizacionDetalleData {
  id: string;
  estado: string;
  moneda: string;
  fecha_desde: string;
  fecha_hasta: string;
  total_estimado: number | null;
  vence_en: string | null;
  reserva_id: string | null;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
  cotizacion_detalle: DetalleLinea[];
}

export function CotizacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const { hotelActual } = useHotel();
  const navigate = useNavigate();
  const [cotizacion, setCotizacion] = useState<CotizacionDetalleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);

  function cargar() {
    if (!hotelActual || !id) return;
    api
      .get<CotizacionDetalleData>(`/hoteles/${hotelActual.hotelId}/cotizaciones/${id}`)
      .then(setCotizacion)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'));
  }

  useEffect(cargar, [hotelActual, id]);

  async function actualizarEstado(estado: 'aprobada' | 'cancelada') {
    if (!hotelActual || !id) return;
    setAccionando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/cotizaciones/${id}/estado`, { estado });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    } finally {
      setAccionando(false);
    }
  }

  async function convertir() {
    if (!hotelActual || !id) return;
    if (!confirm('¿Convertir esta cotización en una reserva confirmada?')) return;
    setAccionando(true);
    setError(null);
    try {
      const resultado = await api.post<{ reserva: { id: string } }>(
        `/hoteles/${hotelActual.hotelId}/cotizaciones/${id}/convertir`,
      );
      navigate(`/reservas/${resultado.reserva.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo convertir');
    } finally {
      setAccionando(false);
    }
  }

  if (!hotelActual) return null;
  if (error && !cotizacion) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!cotizacion) return <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>;

  return (
    <div>
      <Link to="/cotizaciones" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        ← Volver a cotizaciones
      </Link>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 20px' }}>
        <div>
          <h1 style={{ fontSize: 20 }}>
            {cotizacion.huespedes ? `${cotizacion.huespedes.nombres} ${cotizacion.huespedes.apellidos}` : cotizacion.empresas?.razon_social}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {new Date(cotizacion.fecha_desde).toLocaleDateString()} → {new Date(cotizacion.fecha_hasta).toLocaleDateString()}
            {cotizacion.vence_en && ` · vence ${new Date(cotizacion.vence_en).toLocaleDateString()}`}
          </p>
        </div>
        <EstadoBadge estado={cotizacion.estado} />
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {(cotizacion.estado === 'pendiente' || cotizacion.estado === 'aprobada') && (
          <button onClick={convertir} disabled={accionando} style={btnPrimary}>
            Convertir a reserva
          </button>
        )}
        {cotizacion.estado === 'pendiente' && (
          <button onClick={() => actualizarEstado('aprobada')} disabled={accionando} style={btnSecondary}>
            Aprobar
          </button>
        )}
        {cotizacion.estado !== 'cancelada' && cotizacion.estado !== 'convertida' && (
          <button onClick={() => actualizarEstado('cancelada')} disabled={accionando} style={btnDanger}>
            Cancelar
          </button>
        )}
        {cotizacion.reserva_id && (
          <Link to={`/reservas/${cotizacion.reserva_id}`} style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>
            Ver reserva
          </Link>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
              <th style={thStyle}>Habitación</th>
              <th style={thStyle}>Personas</th>
              <th style={thStyle}>Precio/noche</th>
              <th style={thStyle}>Días</th>
              <th style={thStyle}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {cotizacion.cotizacion_detalle.map((l) => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdStyle}>
                  {l.habitaciones?.hab_numero} · {l.habitaciones?.tipos_habitacion?.nombre}
                </td>
                <td style={tdStyle}>{l.nro_personas}</td>
                <td style={tdStyle}>{l.precio_noche}</td>
                <td style={tdStyle}>{l.dias}</td>
                <td style={tdStyle}>{l.subtotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ textAlign: 'right', fontWeight: 500, fontSize: 15, marginTop: 12 }}>
        Total estimado: {cotizacion.moneda} {cotizacion.total_estimado ?? 0}
      </p>
    </div>
  );
}

const thStyle: CSSProperties = { padding: '6px 8px' };
const tdStyle: CSSProperties = { padding: '8px', color: 'var(--text-secondary)' };

const btnPrimary: CSSProperties = {
  padding: '8px 14px',
  background: 'var(--brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  fontWeight: 500,
};

const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const btnDanger: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--ocupada)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};
