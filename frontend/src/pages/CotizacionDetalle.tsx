import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { EstadoBadge } from './Reservas';

interface DetalleLinea {
  id: string;
  nro_personas: number;
  dias: number;
  precio_noche: number | null;
  precio_persona: number | null;
  notas: string | null;
  subtotal: number;
  habitaciones: { hab_numero: number; tipos_habitacion: { nombre: string } | null } | null;
}

interface CotizacionDetalleData {
  id: string;
  estado: string;
  moneda: string;
  fecha_desde: string;
  fecha_hasta: string;
  hora_checkin: string;
  hora_checkout: string;
  total_estimado: number | null;
  vence_en: string | null;
  reserva_id: string | null;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
  cotizacion_detalle: DetalleLinea[];
}

function fmt(n: number): string {
  return Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imprimirCotizacionPDF(cotizacion: CotizacionDetalleData, hotelNombre: string): void {
  const cliente = cotizacion.huespedes
    ? `${cotizacion.huespedes.nombres} ${cotizacion.huespedes.apellidos}`
    : (cotizacion.empresas?.razon_social ?? '—');

  const totalPersonas = cotizacion.cotizacion_detalle.reduce((acc, l) => acc + l.nro_personas, 0);

  const filasHtml = cotizacion.cotizacion_detalle
    .map(
      (l) => `
    <tr>
      <td>${l.habitaciones?.hab_numero ?? '—'}</td>
      <td>${escapeHtml(l.habitaciones?.tipos_habitacion?.nombre ?? '—')}</td>
      <td style="text-align:right">${l.nro_personas}</td>
      <td style="text-align:right">${l.precio_persona != null ? fmt(Number(l.precio_persona)) : '—'}</td>
      <td style="text-align:right">${fmt(Number(l.subtotal))}</td>
      <td>${escapeHtml(l.notas ?? '')}</td>
    </tr>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Cotización</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.hotel { font-size: 13px; color: #555; margin: 0 0 12px; }
  p.meta { font-size: 12px; color: #555; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; }
  tfoot td { font-weight: 700; border-top: 2px solid #1a1a1a; }
  @media print { body { padding: 10mm; } }
</style>
</head>
<body>
  <h1>Cotización</h1>
  <p class="hotel">${escapeHtml(hotelNombre)}</p>
  <p class="meta">
    <b>Cliente:</b> ${escapeHtml(cliente)}
    &nbsp;|&nbsp; <b>Check-in:</b> ${new Date(cotizacion.fecha_desde).toLocaleDateString('es-PE')} ${cotizacion.hora_checkin.slice(0, 5)}
    &nbsp;|&nbsp; <b>Check-out:</b> ${new Date(cotizacion.fecha_hasta).toLocaleDateString('es-PE')} ${cotizacion.hora_checkout.slice(0, 5)}
    &nbsp;|&nbsp; <b>Generado:</b> ${new Date().toLocaleString('es-PE')}
  </p>
  <table>
    <thead>
      <tr>
        <th>Hab.</th><th>Tipo</th><th>Personas</th><th>Precio/persona/noche</th><th>Subtotal</th><th>Nota</th>
      </tr>
    </thead>
    <tbody>${filasHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Total</td>
        <td style="text-align:right">${totalPersonas}</td>
        <td></td>
        <td style="text-align:right">${cotizacion.moneda} ${fmt(cotizacion.total_estimado ?? 0)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;

  const ventana = window.open('', '_blank');
  if (!ventana) return;
  ventana.document.write(html);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 250);
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
            {new Date(cotizacion.fecha_desde).toLocaleDateString()} {cotizacion.hora_checkin?.slice(0, 5)} →{' '}
            {new Date(cotizacion.fecha_hasta).toLocaleDateString()} {cotizacion.hora_checkout?.slice(0, 5)}
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
        <button onClick={() => imprimirCotizacionPDF(cotizacion, hotelActual.nombre)} style={btnSecondary}>
          🖨️ Imprimir / PDF
        </button>
        {cotizacion.reserva_id && (
          <Link to={`/reservas/${cotizacion.reserva_id}`} style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-block' }}>
            Ver reserva
          </Link>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
              <th style={thStyle}>Habitación</th>
              <th style={thStyle}>Personas</th>
              <th style={thStyle}>Precio/persona/noche</th>
              <th style={thStyle}>Días</th>
              <th style={thStyle}>Subtotal</th>
              <th style={thStyle}>Nota</th>
            </tr>
          </thead>
          <tbody>
            {cotizacion.cotizacion_detalle.map((l) => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdStyle}>
                  {l.habitaciones?.hab_numero} · {l.habitaciones?.tipos_habitacion?.nombre}
                </td>
                <td style={tdStyle}>{l.nro_personas}</td>
                <td style={tdStyle}>{l.precio_persona ?? l.precio_noche ?? '—'}</td>
                <td style={tdStyle}>{l.dias}</td>
                <td style={tdStyle}>{l.subtotal}</td>
                <td style={tdStyle}>{l.notas || '—'}</td>
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
