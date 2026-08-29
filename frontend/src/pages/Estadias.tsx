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
    facturable: boolean;
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

function formatoFechaHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const [soloConSaldo, setSoloConSaldo] = useState(false);
  const [filtroFacturable, setFiltroFacturable] = useState('');
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
    if (soloConSaldo) params.set('conSaldo', 'true');
    if (filtroFacturable) params.set('facturable', filtroFacturable);
    const query = params.toString() ? `?${params.toString()}` : '';
    api
      .get<FilaEstadia[]>(`/hoteles/${hotelActual.hotelId}/estadias${query}`)
      .then(setFilas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [hotelActual, filtroEstado, busquedaAplicada, habNumeroAplicado, checkinDesde, checkinHasta, soloConSaldo, filtroFacturable]);

  const filasOrdenadas = useMemo(() => {
    // En curso: por check-in (de mayor a menor). Finalizada: por check-out
    // real (de mayor a menor). El resto (pendiente / todos los estados)
    // sigue por salida programada, que es lo único con sentido temporal
    // para una reserva que todavía no tuvo check-in.
    if (filtroEstado === 'en_curso') {
      return [...filas].sort(
        (a, b) => new Date(b.fecha_hora_checkin_prevista).getTime() - new Date(a.fecha_hora_checkin_prevista).getTime(),
      );
    }
    if (filtroEstado === 'finalizada') {
      return [...filas].sort(
        (a, b) =>
          new Date(b.estadias.checkout_real ?? 0).getTime() - new Date(a.estadias.checkout_real ?? 0).getTime(),
      );
    }
    return [...filas].sort(
      (a, b) => new Date(b.fecha_hora_checkout_prevista).getTime() - new Date(a.fecha_hora_checkout_prevista).getTime(),
    );
  }, [filas, filtroEstado]);

  // Suma del saldo pendiente sobre las filas que quedan visibles según los
  // filtros aplicados (no sobre todas las estadías del hotel).
  const resumenSaldo = useMemo(() => {
    const total = filasOrdenadas.reduce((acc, f) => acc + Number(f.estadias.saldo), 0);
    const cantidadConSaldo = filasOrdenadas.filter((f) => Number(f.estadias.saldo) > 0).length;
    return { total, cantidadConSaldo };
  }, [filasOrdenadas]);

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
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-secondary)',
            padding: '8px 4px',
          }}
        >
          <input type="checkbox" checked={soloConSaldo} onChange={(e) => setSoloConSaldo(e.target.checked)} />
          Solo con saldo pendiente
        </label>
        <select
          value={filtroFacturable}
          onChange={(e) => setFiltroFacturable(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}
        >
          <option value="">Facturable: todas</option>
          <option value="true">Solo facturables</option>
          <option value="false">Solo no facturables</option>
        </select>
        {(habNumero || checkinDesde || checkinHasta || soloConSaldo || filtroFacturable) && (
          <button
            type="button"
            onClick={() => {
              setHabNumero('');
              setCheckinDesde('');
              setCheckinHasta('');
              setSoloConSaldo(false);
              setFiltroFacturable('');
            }}
            style={{ padding: '8px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Limpiar filtros
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            exportarEstadiasPDF(filasOrdenadas, hotelActual.nombre, {
              filtroEstado,
              busquedaAplicada,
              habNumeroAplicado,
              checkinDesde,
              checkinHasta,
              soloConSaldo,
              filtroFacturable,
            })
          }
          disabled={filasOrdenadas.length === 0}
          style={{
            marginLeft: 'auto',
            padding: '8px 12px',
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            cursor: filasOrdenadas.length === 0 ? 'default' : 'pointer',
          }}
        >
          🖨️ Imprimir / PDF
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          Saldo pendiente de {resumenSaldo.cantidadConSaldo} estadía{resumenSaldo.cantidadConSaldo === 1 ? '' : 's'} (según filtro):
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: resumenSaldo.total > 0 ? 'var(--ocupada-text)' : 'var(--text-primary)',
              background: resumenSaldo.total > 0 ? 'var(--saldo-pendiente-bg)' : 'transparent',
              padding: '2px 10px',
              borderRadius: 999,
            }}
          >
            PEN {resumenSaldo.total.toFixed(2)}
          </span>
        </div>
      )}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1520 }}>
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                <th style={thStyle}>Habitación</th>
                <th style={thStyle}>Huésped</th>
                <th style={thStyle}>DNI</th>
                <th style={thStyle}>Teléfono</th>
                <th style={thStyle}>RUC</th>
                <th style={thStyle}>Empresa</th>
                <th style={thStyle}>Check-in</th>
                <th style={thStyle}>Check-out real</th>
                <th style={thStyle}>Salida programada</th>
                <th style={thStyle}>Desayuno</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Tarifa/día</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Saldo</th>
                <th style={thStyle}>Estado</th>
                <th style={{ ...thStyle, borderRight: 'none' }}>Facturable</th>
              </tr>
            </thead>
            <tbody>
              {filasOrdenadas.map((f, i) => (
                <tr
                  key={f.estadias.id}
                  onClick={() => navigate(`/estadias/${f.estadias.id}`)}
                  style={{
                    borderTop: '2px solid var(--table-border)',
                    background:
                      f.estadias.saldo > 0
                        ? 'var(--saldo-pendiente-bg)'
                        : i % 2 === 1
                          ? 'var(--surface-1)'
                          : 'transparent',
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
                  <td style={tdStyle}>{formatoFechaHora(f.fecha_hora_checkin_prevista)}</td>
                  <td style={tdStyle}>{formatoFechaHora(f.estadias.checkout_real)}</td>
                  <td style={tdStyle}>{formatoFechaHora(f.fecha_hora_checkout_prevista)}</td>
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
                  <td style={tdStyle}>
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
                  <td style={{ ...tdStyle, borderRight: 'none' }}>{f.estadias.facturable ? 'Sí' : 'No'}</td>
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

// Descripción legible de los filtros activos, para que quede constancia en
// el PDF de qué exactamente se imprimió (mismo criterio que
// exportarLiquidacionPDF en Caja.tsx: nada de generar el PDF en el
// backend, se arma el HTML acá y se manda a imprimir con window.print()).
function describirFiltros(f: {
  filtroEstado: string;
  busquedaAplicada: string;
  habNumeroAplicado: string;
  checkinDesde: string;
  checkinHasta: string;
  soloConSaldo: boolean;
  filtroFacturable: string;
}): string {
  const partes: string[] = [];
  partes.push(f.filtroEstado ? `Estado: ${ESTADO_LABEL[f.filtroEstado] ?? f.filtroEstado}` : 'Todos los estados');
  if (f.busquedaAplicada) partes.push(`Búsqueda: "${f.busquedaAplicada}"`);
  if (f.habNumeroAplicado) partes.push(`Habitación: ${f.habNumeroAplicado}`);
  if (f.checkinDesde) partes.push(`Check-in desde: ${formatoFecha(f.checkinDesde + 'T00:00:00')}`);
  if (f.checkinHasta) partes.push(`Check-in hasta: ${formatoFecha(f.checkinHasta + 'T00:00:00')}`);
  if (f.soloConSaldo) partes.push('Solo con saldo pendiente');
  if (f.filtroFacturable === 'true') partes.push('Solo facturables');
  if (f.filtroFacturable === 'false') partes.push('Solo no facturables');
  return partes.join(' · ');
}

// El dato "Facturable" no se incluye en las filas de este PDF a propósito
// (se ve en pantalla, no impreso) -- solo se menciona en la línea de
// filtros de arriba si se usó ese filtro, para dejar constancia de qué se
// exportó, sin listar el estado de cada estadía una por una.
function exportarEstadiasPDF(
  filas: FilaEstadia[],
  hotelNombre: string,
  filtros: {
    filtroEstado: string;
    busquedaAplicada: string;
    habNumeroAplicado: string;
    checkinDesde: string;
    checkinHasta: string;
    soloConSaldo: boolean;
    filtroFacturable: string;
  },
): void {
  const fmt = (n: number) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalSaldo = filas.reduce((acc, f) => acc + Number(f.estadias.saldo), 0);

  const filasHtml = filas
    .map(
      (f) => `
    <tr>
      <td>${f.habitaciones?.hab_numero ?? '—'}</td>
      <td>${f.reservas?.huespedes ? escapeHtml(`${f.reservas.huespedes.nombres} ${f.reservas.huespedes.apellidos}`) : '—'}</td>
      <td>${escapeHtml(f.reservas?.huespedes?.nro_doc ?? '—')}</td>
      <td>${escapeHtml(f.reservas?.huespedes?.telefono || '—')}</td>
      <td>${escapeHtml(f.reservas?.huespedes?.ruc || '—')}</td>
      <td>${escapeHtml(f.reservas?.huespedes?.razon_social || '—')}</td>
      <td>${formatoFechaHora(f.fecha_hora_checkin_prevista)}</td>
      <td>${formatoFechaHora(f.estadias.checkout_real)}</td>
      <td>${f.incluye_desayuno ? 'Sí' : 'No'}</td>
      <td style="text-align:right">${fmt(f.tarifa_dia)}</td>
      <td style="text-align:right; font-weight:${Number(f.estadias.saldo) > 0 ? '700' : '400'}">${fmt(f.estadias.saldo)}</td>
      <td>${ESTADO_LABEL[f.estadias.estado_actual] ?? f.estadias.estado_actual}</td>
    </tr>
  `,
    )
    .join('');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Listado de estadías</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 24px; color: #1a1a1a; font-size: 12px; }
  h1 { font-size: 17px; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px; }
  .hotel { text-align: center; font-size: 12px; color: #5f6068; margin: 0 0 10px; }
  .meta { text-align: center; font-size: 11.5px; color: #333; margin: 0 0 18px; padding-bottom: 10px; border-bottom: 2px solid #1a1a1a; }
  .meta b { color: #000; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #5f6068; padding: 5px 6px; border-bottom: 1px solid #1a1a1a; white-space: nowrap; }
  td { padding: 5px 6px; border-bottom: 1px solid #e2e2e2; white-space: nowrap; }
  th:nth-child(10), td:nth-child(10), th:nth-child(11), td:nth-child(11) { text-align: right; }
  tfoot td { font-weight: 700; border-top: 1.5px solid #1a1a1a; border-bottom: none; padding-top: 8px; }
  @media print {
    body { padding: 10mm; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>Listado de estadías</h1>
  <p class="hotel">${escapeHtml(hotelNombre)}</p>
  <p class="meta">
    <b>Generado:</b> ${new Date().toLocaleString('es-PE')}
    &nbsp;|&nbsp; <b>Filtros:</b> ${escapeHtml(describirFiltros(filtros))}
    &nbsp;|&nbsp; <b>Registros:</b> ${filas.length}
  </p>
  <table>
    <thead>
      <tr>
        <th>Hab.</th><th>Huésped</th><th>DNI</th><th>Teléfono</th><th>RUC</th><th>Empresa</th>
        <th>Check-in</th><th>Check-out real</th><th>Desayuno</th><th>Tarifa/día</th><th>Saldo (S/)</th><th>Estado</th>
      </tr>
    </thead>
    <tbody>${filasHtml}</tbody>
    <tfoot>
      <tr><td colspan="10">Total saldo pendiente</td><td style="text-align:right">${fmt(totalSaldo)}</td><td></td></tr>
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

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const thStyle: CSSProperties = {
  padding: '10px 14px',
  whiteSpace: 'nowrap',
  fontWeight: 700,
  background: 'var(--table-header-bg)',
  color: 'var(--table-header-text)',
  borderRight: '2px solid var(--table-header-border)',
  borderBottom: '2px solid var(--table-header-border)',
};

const tdStyle: CSSProperties = {
  padding: '10px 14px',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  borderRight: '2px solid var(--table-border)',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 3,
};
