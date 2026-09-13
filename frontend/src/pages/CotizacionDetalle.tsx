import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { EstadoBadge } from './Reservas';

interface DetalleLinea {
  id: string;
  habitacion_id: string;
  nro_personas: number;
  dias: number;
  precio_noche: number | null;
  precio_persona: number | null;
  notas: string | null;
  subtotal: number;
  disponibilidad_forzada: boolean;
  habitaciones: { hab_numero: number; tipos_habitacion: { nombre: string } | null } | null;
}

interface HotelIdentidad {
  nombre: string;
  logo_url: string | null;
  razon_social: string | null;
  ruc: string | null;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
  nombre_contacto: string | null;
  eslogan: string | null;
}

interface HabitacionParaAgregar {
  id: string;
  hab_numero: number;
  piso: number;
  tipos_habitacion: { nombre: string; aforo_max: number } | null;
}

interface HabitacionNoDisponibleParaAgregar extends HabitacionParaAgregar {
  motivo: string;
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

function imprimirCotizacionPDF(cotizacion: CotizacionDetalleData, hotel: HotelIdentidad): void {
  const cliente = cotizacion.huespedes
    ? `${cotizacion.huespedes.nombres} ${cotizacion.huespedes.apellidos}`
    : (cotizacion.empresas?.razon_social ?? '—');

  const totalPersonas = cotizacion.cotizacion_detalle.reduce((acc, l) => acc + l.nro_personas, 0);

  const filasHtml = cotizacion.cotizacion_detalle
    .map(
      (l, i) => `
    <tr style="background:${i % 2 === 1 ? '#f2f7fb' : '#ffffff'}">
      <td>${l.habitaciones?.hab_numero ?? '—'}</td>
      <td>${escapeHtml(l.habitaciones?.tipos_habitacion?.nombre ?? '—')}</td>
      <td style="text-align:right">${l.nro_personas}</td>
      <td style="text-align:right">${l.precio_persona != null ? fmt(Number(l.precio_persona)) : '—'}</td>
      <td style="text-align:right">${l.dias}</td>
      <td style="text-align:right;font-weight:700">${fmt(Number(l.subtotal))}</td>
      <td>${escapeHtml(l.notas ?? '')}${l.disponibilidad_forzada ? ' <span style="color:#b3261e;font-weight:700">(no disponible al cotizar)</span>' : ''}</td>
    </tr>`,
    )
    .join('');

  const razonSocial = hotel.razon_social || hotel.nombre;
  const contactoLinea = hotel.nombre_contacto ? escapeHtml(hotel.nombre_contacto) : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Cotización</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px 24px; color: #14324a; }
  .encabezado { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 4px solid #1a4f7a; padding-bottom: 14px; margin-bottom: 16px; }
  .encabezado .marca { display: flex; align-items: center; gap: 14px; }
  .encabezado img.logo { max-height: 72px; max-width: 140px; object-fit: contain; }
  .encabezado h1 { font-size: 22px; margin: 0; color: #0b3a5c; letter-spacing: 0.5px; }
  .encabezado .ciudad { font-size: 11px; color: #4a6c85; letter-spacing: 1px; margin-top: 2px; }
  .encabezado .eslogan { font-size: 12px; font-style: italic; color: #4a6c85; text-align: right; max-width: 220px; }
  .datos { font-size: 12px; line-height: 1.7; margin-bottom: 14px; }
  .datos b { color: #0b3a5c; }
  .totales {
    display: flex; gap: 28px; align-items: center; font-weight: 700; font-size: 15px;
    color: #0b3a5c; background: #e3f0fa; border: 1px solid #a9cfe6;
    border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 12px; border: 2px solid #1a4f7a; table-layout: fixed; }
  th, td { border-right: 1px solid #bcd4e6; border-bottom: 1px solid #bcd4e6; padding: 7px 8px; text-align: left; word-wrap: break-word; }
  th { background: #1a4f7a; color: #fff; font-weight: 700; }
  .pie { margin-top: 18px; border-top: 2px solid #1a4f7a; padding-top: 10px; font-size: 11px; color: #4a6c85; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .pie b { color: #0b3a5c; }
  @page { size: portrait; margin: 12mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="encabezado">
    <div class="marca">
      ${hotel.logo_url ? `<img class="logo" src="${hotel.logo_url}" alt="Logo">` : ''}
      <div>
        <h1>${escapeHtml(hotel.nombre)}</h1>
        ${hotel.ciudad ? `<div class="ciudad">${escapeHtml(hotel.ciudad.toUpperCase())}</div>` : ''}
      </div>
    </div>
    ${hotel.eslogan ? `<div class="eslogan">${escapeHtml(hotel.eslogan)}</div>` : ''}
  </div>

  <div class="datos">
    <div><b>Razón Social:</b> ${escapeHtml(razonSocial)}</div>
    ${hotel.ruc ? `<div><b>RUC:</b> ${escapeHtml(hotel.ruc)}</div>` : ''}
    ${hotel.direccion ? `<div><b>Dirección:</b> ${escapeHtml(hotel.direccion)}</div>` : ''}
    ${contactoLinea ? `<div><b>Contacto:</b> ${contactoLinea}</div>` : ''}
    <div style="margin-top:8px">
      <b>Cliente:</b> ${escapeHtml(cliente)}
      &nbsp;|&nbsp; <b>Check-in:</b> ${new Date(cotizacion.fecha_desde).toLocaleDateString('es-PE')} ${cotizacion.hora_checkin.slice(0, 5)}
      &nbsp;|&nbsp; <b>Check-out:</b> ${new Date(cotizacion.fecha_hasta).toLocaleDateString('es-PE')} ${cotizacion.hora_checkout.slice(0, 5)}
      &nbsp;|&nbsp; <b>Generado:</b> ${new Date().toLocaleString('es-PE')}
    </div>
  </div>

  <div class="totales">
    <span>👥 Total personas: ${totalPersonas}</span>
    <span>💰 Total estimado: ${cotizacion.moneda} ${fmt(cotizacion.total_estimado ?? 0)}</span>
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

  <div class="pie">
    <div>${hotel.direccion ? `📍 ${escapeHtml(hotel.direccion)}` : ''}</div>
    <div>${hotel.telefono ? `<b>Reservas y consultas:</b> ${escapeHtml(hotel.telefono)}` : ''}</div>
  </div>
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
  const [hotelInfo, setHotelInfo] = useState<HotelIdentidad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombresEdit, setNombresEdit] = useState('');
  const [apellidosEdit, setApellidosEdit] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  const [editandoLineaId, setEditandoLineaId] = useState<string | null>(null);
  const [personasEdit, setPersonasEdit] = useState(1);
  const [precioEdit, setPrecioEdit] = useState(0);
  const [notaEdit, setNotaEdit] = useState('');
  const [guardandoLinea, setGuardandoLinea] = useState(false);

  const [panelAgregar, setPanelAgregar] = useState<'disponibles' | 'no_disponibles' | null>(null);
  const [opcionesAgregar, setOpcionesAgregar] = useState<
    (HabitacionParaAgregar | HabitacionNoDisponibleParaAgregar)[]
  >([]);
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [habitacionSeleccionada, setHabitacionSeleccionada] = useState<
    HabitacionParaAgregar | HabitacionNoDisponibleParaAgregar | null
  >(null);
  const [nuevaPersonas, setNuevaPersonas] = useState(1);
  const [nuevoPrecio, setNuevoPrecio] = useState(0);
  const [nuevaNota, setNuevaNota] = useState('');
  const [agregando, setAgregando] = useState(false);

  function cargar() {
    if (!hotelActual || !id) return;
    api
      .get<CotizacionDetalleData>(`/hoteles/${hotelActual.hotelId}/cotizaciones/${id}`)
      .then(setCotizacion)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'));
  }

  useEffect(cargar, [hotelActual, id]);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<HotelIdentidad>(`/hoteles/${hotelActual.hotelId}`)
      .then(setHotelInfo)
      .catch(() => {});
  }, [hotelActual]);

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

  function iniciarEdicionLinea(l: DetalleLinea) {
    setEditandoLineaId(l.id);
    setPersonasEdit(l.nro_personas);
    setPrecioEdit(Number(l.precio_persona ?? l.precio_noche ?? 0));
    setNotaEdit(l.notas ?? '');
    setError(null);
  }

  async function guardarLinea(lineaId: string) {
    if (!hotelActual || !id) return;
    setGuardandoLinea(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/cotizaciones/${id}/detalle/${lineaId}`, {
        nroPersonas: personasEdit,
        precioPersona: precioEdit,
        notas: notaEdit.trim(),
      });
      setEditandoLineaId(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo editar la habitación');
    } finally {
      setGuardandoLinea(false);
    }
  }

  async function abrirPanelAgregar(tipo: 'disponibles' | 'no_disponibles') {
    if (!hotelActual || !id) return;
    setPanelAgregar(tipo);
    setHabitacionSeleccionada(null);
    setOpcionesAgregar([]);
    setCargandoOpciones(true);
    setError(null);
    try {
      const ruta = tipo === 'disponibles' ? 'habitaciones-disponibles' : 'habitaciones-no-disponibles';
      const resultado = await api.get<{
        habitaciones: (HabitacionParaAgregar | HabitacionNoDisponibleParaAgregar)[];
      }>(`/hoteles/${hotelActual.hotelId}/cotizaciones/${id}/${ruta}`);
      setOpcionesAgregar(resultado.habitaciones);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo consultar disponibilidad');
    } finally {
      setCargandoOpciones(false);
    }
  }

  function seleccionarParaAgregar(h: HabitacionParaAgregar | HabitacionNoDisponibleParaAgregar) {
    setHabitacionSeleccionada(h);
    setNuevaPersonas(1);
    setNuevoPrecio(0);
    setNuevaNota('');
  }

  async function confirmarAgregar() {
    if (!hotelActual || !id || !habitacionSeleccionada) return;
    setAgregando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/cotizaciones/${id}/detalle`, {
        habitacionId: habitacionSeleccionada.id,
        nroPersonas: nuevaPersonas,
        precioPersona: nuevoPrecio,
        notas: nuevaNota.trim() || undefined,
        forzarNoDisponible: panelAgregar === 'no_disponibles' || undefined,
      });
      setPanelAgregar(null);
      setHabitacionSeleccionada(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo agregar la habitación');
    } finally {
      setAgregando(false);
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
        <button
          onClick={() =>
            imprimirCotizacionPDF(
              cotizacion,
              hotelInfo ?? {
                nombre: hotelActual.nombre,
                logo_url: null,
                razon_social: null,
                ruc: null,
                direccion: null,
                ciudad: null,
                telefono: null,
                nombre_contacto: null,
                eslogan: null,
              },
            )
          }
          style={btnSecondary}
        >
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
      </div>

      {puedeEditar && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => abrirPanelAgregar('disponibles')} style={btnSecondary}>
            + Agregar habitación
          </button>
          <button type="button" onClick={() => abrirPanelAgregar('no_disponibles')} style={btnSecondary}>
            + Agregar habitación no disponible
          </button>
        </div>
      )}

      {panelAgregar && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 14,
            marginBottom: 16,
            background: 'var(--surface-1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>
              {panelAgregar === 'disponibles' ? 'Habitaciones disponibles' : 'Habitaciones no disponibles en ese rango'}
            </p>
            <button type="button" onClick={() => setPanelAgregar(null)} style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}>
              Cerrar
            </button>
          </div>

          {cargandoOpciones ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>
          ) : opcionesAgregar.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {panelAgregar === 'disponibles'
                ? 'No hay más habitaciones disponibles para agregar.'
                : 'No hay habitaciones no disponibles -- todas están libres en ese rango.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: habitacionSeleccionada ? 12 : 0 }}>
              {opcionesAgregar.map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '6px 10px',
                    border: habitacionSeleccionada?.id === h.id ? '1px solid var(--brand)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 12.5,
                  }}
                >
                  <span style={{ fontWeight: 700, minWidth: 40 }}>{h.hab_numero}</span>
                  <span style={{ color: 'var(--text-secondary)', minWidth: 100 }}>
                    {h.tipos_habitacion?.nombre ?? '—'}
                  </span>
                  {'motivo' in h && <span style={{ color: 'var(--danger)', flex: 1 }}>{h.motivo}</span>}
                  <button type="button" onClick={() => seleccionarParaAgregar(h)} style={btnSecondary}>
                    Seleccionar
                  </button>
                </div>
              ))}
            </div>
          )}

          {habitacionSeleccionada && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                alignItems: 'flex-end',
                borderTop: '1px solid var(--border)',
                paddingTop: 12,
              }}
            >
              <p style={{ fontSize: 12.5, margin: 0, fontWeight: 600 }}>
                Hab. {habitacionSeleccionada.hab_numero} · {habitacionSeleccionada.tipos_habitacion?.nombre ?? '—'}
              </p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                Personas
                <input
                  type="number"
                  min={1}
                  value={nuevaPersonas}
                  onChange={(e) => setNuevaPersonas(Math.max(1, Number(e.target.value)))}
                  style={{ ...inputEditStyle, width: 70 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                Precio/persona/noche
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={nuevoPrecio}
                  onChange={(e) => setNuevoPrecio(Math.max(0, Number(e.target.value)))}
                  style={{ ...inputEditStyle, width: 100 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                Nota (opcional)
                <input
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  style={{ ...inputEditStyle, width: 180 }}
                />
              </label>
              <button type="button" onClick={confirmarAgregar} disabled={agregando} style={btnPrimary}>
                {agregando ? 'Agregando...' : 'Agregar'}
              </button>
              <button type="button" onClick={() => setHabitacionSeleccionada(null)} disabled={agregando} style={btnSecondary}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

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
            {cotizacion.cotizacion_detalle.map((l, i) => {
              const editando = editandoLineaId === l.id;
              return (
                <tr key={l.id} style={{ background: i % 2 === 1 ? 'var(--surface-0)' : 'var(--surface-1)' }}>
                  <td style={tdStyle}>
                    {l.habitaciones?.hab_numero} · {l.habitaciones?.tipos_habitacion?.nombre}
                    {l.disponibilidad_forzada && (
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--danger)', fontWeight: 400 }}>
                        ⚠ No disponible al cotizar
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editando ? (
                      <input
                        type="number"
                        min={1}
                        value={personasEdit}
                        onChange={(e) => setPersonasEdit(Math.max(1, Number(e.target.value)))}
                        style={{ ...inputEditStyle, width: 70 }}
                      />
                    ) : (
                      l.nro_personas
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editando ? (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={precioEdit}
                        onChange={(e) => setPrecioEdit(Math.max(0, Number(e.target.value)))}
                        style={{ ...inputEditStyle, width: 100 }}
                      />
                    ) : (
                      (l.precio_persona ?? l.precio_noche ?? '—')
                    )}
                  </td>
                  <td style={tdStyle}>{l.dias}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{l.subtotal}</td>
                  <td style={tdStyle}>
                    {editando ? (
                      <input
                        value={notaEdit}
                        onChange={(e) => setNotaEdit(e.target.value)}
                        style={{ ...inputEditStyle, width: 160 }}
                      />
                    ) : (
                      l.notas || '—'
                    )}
                  </td>
                  {puedeEditar && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {editando ? (
                        <span style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => guardarLinea(l.id)}
                            disabled={guardandoLinea}
                            style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                          >
                            {guardandoLinea ? '...' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditandoLineaId(null)}
                            disabled={guardandoLinea}
                            style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => iniciarEdicionLinea(l)}
                            style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => quitarLinea(l.id)}
                            disabled={quitandoId === l.id}
                            style={btnQuitar}
                          >
                            {quitandoId === l.id ? '...' : 'Quitar'}
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
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
