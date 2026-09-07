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
  huesped_id: string | null;
  estado: string;
  moneda: string;
  fecha_desde: string;
  fecha_hasta: string;
  hora_checkin: string;
  hora_checkout: string;
  total_estimado: number | null;
  adelanto: number | null;
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
  const adelanto = Number(cotizacion.adelanto ?? 0);
  const diferenciaAPagar = Number(cotizacion.total_estimado ?? 0) - adelanto;

  const filasHtml = cotizacion.cotizacion_detalle
    .map(
      (l, i) => `
    <tr style="background:${i % 2 === 1 ? '#f7f7f5' : '#ffffff'}">
      <td>${l.habitaciones?.hab_numero ?? '—'}</td>
      <td>${escapeHtml(l.habitaciones?.tipos_habitacion?.nombre ?? '—')}</td>
      <td style="text-align:right">${l.nro_personas}</td>
      <td style="text-align:right">${l.precio_persona != null ? fmt(Number(l.precio_persona)) : '—'}</td>
      <td style="text-align:right">${l.dias}</td>
      <td style="text-align:right;font-weight:700">${fmt(Number(l.subtotal))}</td>
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
  .totales {
    display: flex; gap: 28px; font-weight: 700; font-size: 16px;
    color: #0b3a4a; background: #dcedf8; border: 1px solid #6fa2c2;
    border-radius: 8px; padding: 10px 14px; margin-bottom: 16px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 12px; border: 2px solid #6fa2c2; table-layout: fixed; }
  th, td { border-right: 2px solid #b9b7ac; border-bottom: 2px solid #b9b7ac; padding: 7px 8px; text-align: left; word-wrap: break-word; }
  th { background: #dcedf8; color: #0b3a4a; font-weight: 700; border-bottom: 2px solid #6fa2c2; border-right: 2px solid #6fa2c2; }
  @page { size: portrait; margin: 12mm; }
  @media print { body { padding: 0; } }
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
  <div class="totales">
    <span>Total personas: ${totalPersonas}</span>
    <span>Total estimado: ${cotizacion.moneda} ${fmt(cotizacion.total_estimado ?? 0)}</span>
    ${adelanto > 0 ? `<span>Adelanto pagado: ${cotizacion.moneda} ${fmt(adelanto)}</span>` : ''}
    <span>Diferencia a pagar: ${cotizacion.moneda} ${fmt(diferenciaAPagar)}</span>
  </div>
  <table>
    <colgroup>
      <col style="width:9%"><col style="width:16%"><col style="width:11%">
      <col style="width:16%"><col style="width:8%"><col style="width:14%"><col style="width:26%">
    </colgroup>
    <thead>
      <tr>
        <th>Hab.</th><th>Tipo</th><th>Personas</th><th>Precio/persona/noche</th><th>Días</th><th>Subtotal</th><th>Nota</th>
      </tr>
    </thead>
    <tbody>${filasHtml}</tbody>
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
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombresEdit, setNombresEdit] = useState('');
  const [apellidosEdit, setApellidosEdit] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);

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

  async function quitarLinea(lineaId: string) {
    if (!hotelActual || !id) return;
    if (!confirm('¿Quitar esta habitación de la cotización?')) return;
    setQuitandoId(lineaId);
    setError(null);
    try {
      await api.delete(`/hoteles/${hotelActual.hotelId}/cotizaciones/${id}/detalle/${lineaId}`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar la habitación');
    } finally {
      setQuitandoId(null);
    }
  }

  function iniciarEdicionNombre() {
    if (!cotizacion?.huespedes) return;
    setNombresEdit(cotizacion.huespedes.nombres);
    setApellidosEdit(cotizacion.huespedes.apellidos);
    setEditandoNombre(true);
  }

  async function guardarNombre() {
    if (!hotelActual || !cotizacion?.huesped_id) return;
    if (!nombresEdit.trim() || !apellidosEdit.trim()) {
      setError('Nombres y apellidos no pueden quedar vacíos.');
      return;
    }
    setGuardandoNombre(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/huespedes/${cotizacion.huesped_id}`, {
        nombres: nombresEdit.trim(),
        apellidos: apellidosEdit.trim(),
      });
      setEditandoNombre(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el nombre del cliente');
    } finally {
      setGuardandoNombre(false);
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

  const puedeEditar = cotizacion.estado !== 'convertida';
  const adelantoPagado = Number(cotizacion.adelanto ?? 0);
  const diferenciaAPagar = Number(cotizacion.total_estimado ?? 0) - adelantoPagado;

  return (
    <div>
      <Link to="/cotizaciones" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        ← Volver a cotizaciones
      </Link>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 20px' }}>
        <div>
          {editandoNombre ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <input
                value={nombresEdit}
                onChange={(e) => setNombresEdit(e.target.value)}
                placeholder="Nombres"
                style={inputEditStyle}
              />
              <input
                value={apellidosEdit}
                onChange={(e) => setApellidosEdit(e.target.value)}
                placeholder="Apellidos"
                style={inputEditStyle}
              />
              <button type="button" onClick={guardarNombre} disabled={guardandoNombre} style={btnPrimary}>
                {guardandoNombre ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => setEditandoNombre(false)} disabled={guardandoNombre} style={btnSecondary}>
                Cancelar
              </button>
            </div>
          ) : (
            <h1 style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              {cotizacion.huespedes ? `${cotizacion.huespedes.nombres} ${cotizacion.huespedes.apellidos}` : cotizacion.empresas?.razon_social}
              {cotizacion.huesped_id && (
                <button
                  type="button"
                  onClick={iniciarEdicionNombre}
                  title="Editar nombre del cliente"
                  style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                >
                  Editar
                </button>
              )}
            </h1>
          )}
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

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 28px',
          fontWeight: 700,
          fontSize: 16,
          color: 'var(--table-header-text)',
          background: 'var(--table-header-bg)',
          border: '1px solid var(--table-header-border)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          marginBottom: 12,
        }}
      >
        <span>Total personas: {cotizacion.cotizacion_detalle.reduce((acc, l) => acc + l.nro_personas, 0)}</span>
        <span>
          Total estimado: {cotizacion.moneda} {fmt(cotizacion.total_estimado ?? 0)}
        </span>
        {adelantoPagado > 0 && (
          <span>
            Adelanto pagado: {cotizacion.moneda} {fmt(adelantoPagado)}
          </span>
        )}
        <span style={{ color: diferenciaAPagar > 0 ? 'var(--danger)' : 'var(--disponible)' }}>
          Diferencia a pagar: {cotizacion.moneda} {fmt(diferenciaAPagar)}
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '2px solid var(--table-header-border)', borderRadius: 'var(--radius)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16, minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 14 }}>
              <th style={thStyle}>Habitación</th>
              <th style={thStyle}>Personas</th>
              <th style={thStyle}>Precio/persona/noche</th>
              <th style={thStyle}>Días</th>
              <th style={thStyle}>Subtotal</th>
              <th style={thStyle}>Nota</th>
              {puedeEditar && <th style={{ ...thStyle, textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {cotizacion.cotizacion_detalle.map((l, i) => (
              <tr key={l.id} style={{ background: i % 2 === 1 ? 'var(--surface-0)' : 'var(--surface-1)' }}>
                <td style={tdStyle}>
                  {l.habitaciones?.hab_numero} · {l.habitaciones?.tipos_habitacion?.nombre}
                </td>
                <td style={tdStyle}>{l.nro_personas}</td>
                <td style={tdStyle}>{l.precio_persona ?? l.precio_noche ?? '—'}</td>
                <td style={tdStyle}>{l.dias}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{l.subtotal}</td>
                <td style={tdStyle}>{l.notas || '—'}</td>
                {puedeEditar && (
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => quitarLinea(l.id)}
                      disabled={quitandoId === l.id}
                      style={btnQuitar}
                    >
                      {quitandoId === l.id ? '...' : 'Quitar'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  fontSize: 15,
  color: 'var(--text-secondary)',
  borderRight: '2px solid var(--table-border)',
  borderBottom: '2px solid var(--table-border)',
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

const inputEditStyle: CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 15,
};

const btnQuitar: CSSProperties = {
  padding: '4px 8px',
  background: 'transparent',
  border: '1px solid var(--danger)',
  borderRadius: 'var(--radius)',
  color: 'var(--danger)',
  fontSize: 11.5,
  cursor: 'pointer',
};
