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
  notas: string | null;
  created_at: string;
  moneda_pago: 'PEN' | 'USD' | null;
  monto_original: number | null;
  tipo_cambio_aplicado: number | null;
}

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

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
  turnos: { nombre: string } | null;
}

const METODOS = ['efectivo', 'transferencia', 'yape', 'tarjeta'];

export function Caja() {
  const { hotelActual, personalNombre } = useHotel();
  const [sesion, setSesion] = useState<SesionCaja | null>(null);
  const [sesionCerrada, setSesionCerrada] = useState<SesionCaja | null>(null);
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
      setSesionCerrada(null);
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
      // Se guarda la respuesta del cierre (trae los totales finales) para
      // mostrar un resumen antes de que la pantalla vuelva al formulario de
      // abrir turno -- si no, se perdía de vista justo el momento en que
      // más se necesitan esos números (para cuadrar caja o exportarlos).
      const cerrada = await api.post<SesionCaja>(`/hoteles/${hotelActual.hotelId}/caja/sesiones/${sesion.id}/cerrar`);
      setSesionCerrada(cerrada);
      setSesion(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cerrar el turno');
    } finally {
      setAccionando(false);
    }
  }

  if (!hotelActual) return null;
  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>;

  if (sesionCerrada) {
    return (
      <div>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Caja</h1>
        <p style={{ fontSize: 13, color: 'var(--disponible)', marginBottom: 12 }}>
          Turno cerrado correctamente. Este es el resumen final:
        </p>
        <ResumenSesion
          sesion={sesionCerrada}
          hotelId={hotelActual.hotelId}
          esAdmin={hotelActual.rol === 'admin'}
          onActualizado={setSesionCerrada}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => exportarLiquidacionPDF(sesionCerrada, hotelActual.nombre, personalNombre)}
            style={btnSecondary}
          >
            Exportar PDF
          </button>
          <button
            onClick={() => {
              setSesionCerrada(null);
              cargarSesionActual();
            }}
            style={btnPrimary}
          >
            Entendido, abrir un nuevo turno
          </button>
        </div>
      </div>
    );
  }

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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Abierta {new Date(sesion.abierta_en).toLocaleString()}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => exportarLiquidacionPDF(sesion, hotelActual.nombre, personalNombre)}
                style={btnSecondary}
              >
                Exportar PDF
              </button>
              <button onClick={cerrarTurno} disabled={accionando} style={btnDanger}>
                Cerrar turno
              </button>
            </div>
          </div>

          <ResumenSesion
            sesion={sesion}
            hotelId={hotelActual.hotelId}
            esAdmin={hotelActual.rol === 'admin'}
            onActualizado={setSesion}
          />

          <RegistrarMovimientoForm
            hotelId={hotelActual.hotelId}
            sesionId={sesion.id}
            onRegistrado={cargarSesionActual}
          />
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

function ResumenSesion({
  sesion,
  hotelId,
  esAdmin,
  onActualizado,
}: {
  sesion: SesionCaja;
  hotelId: string;
  esAdmin: boolean;
  onActualizado: (sesion: SesionCaja) => void;
}) {
  const saldoFinal = sesion.estado === 'cerrada' && sesion.saldo_final != null ? sesion.saldo_final : sesion.saldoActual;
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [montoEdicion, setMontoEdicion] = useState('');
  const [metodoEdicion, setMetodoEdicion] = useState('efectivo');
  const [notasEdicion, setNotasEdicion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function iniciarEdicion(movimientoId: string, montoActual: number, metodoActual: string, notasActuales: string | null) {
    setEditandoId(movimientoId);
    setMontoEdicion(String(montoActual));
    setMetodoEdicion(metodoActual);
    setNotasEdicion(notasActuales ?? '');
    setError(null);
  }

  async function guardarEdicion(movimientoId: string) {
    if (montoEdicion === '') return;
    setGuardando(true);
    setError(null);
    try {
      const actualizada = await api.patch<SesionCaja>(
        `/hoteles/${hotelId}/caja/sesiones/${sesion.id}/movimientos/${movimientoId}`,
        { monto: Number(montoEdicion), metodoPago: metodoEdicion, notas: notasEdicion },
      );
      setEditandoId(null);
      onActualizado(actualizada);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo editar el movimiento');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Saldo inicial" value={`PEN ${Number(sesion.saldo_inicial).toFixed(2)}`} />
        <MetricCard label="Ingresos" value={`PEN ${Number(sesion.totalIngresos).toFixed(2)}`} />
        <MetricCard label="Egresos" value={`PEN ${Number(sesion.totalEgresos).toFixed(2)}`} />
        <MetricCard label={sesion.estado === 'cerrada' ? 'Saldo final' : 'Saldo actual'} value={`PEN ${Number(saldoFinal).toFixed(2)}`} destacado />
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      <div style={{ overflowX: 'auto', border: '2px solid var(--table-border)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 11 }}>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Concepto</th>
              <th style={thStyle}>Método</th>
              <th style={thStyle}>Monto</th>
              <th style={thStyle}>Hora</th>
              <th style={esAdmin ? thStyle : { ...thStyle, borderRight: 'none' }}>Notas</th>
              {esAdmin && <th style={{ ...thStyle, borderRight: 'none' }}></th>}
            </tr>
          </thead>
          <tbody>
            {sesion.movimientos.map((m) => {
              const color = m.tipo === 'ingreso' ? 'var(--ingreso)' : 'var(--egreso)';
              const bg = m.tipo === 'ingreso' ? 'var(--ingreso-bg)' : 'var(--egreso-bg)';
              return (
                <tr key={m.id} style={{ borderTop: '2px solid var(--table-border)', background: bg }}>
                  <td style={{ ...tdStyle, color, fontWeight: 500 }}>{m.tipo}</td>
                  <td style={{ ...tdStyle, color }}>{m.concepto}</td>
                  <td style={{ ...tdStyle, color }}>
                    {editandoId === m.id ? (
                      <select
                        value={metodoEdicion}
                        onChange={(e) => setMetodoEdicion(e.target.value)}
                        style={{ fontSize: 12, padding: '2px 4px' }}
                      >
                        {METODOS.map((met) => (
                          <option key={met} value={met}>
                            {met}
                          </option>
                        ))}
                      </select>
                    ) : (
                      m.metodo_pago
                    )}
                  </td>
                  <td style={{ ...tdStyle, color, fontWeight: 600 }}>
                    {editandoId === m.id ? (
                      <input
                        type="number"
                        step={0.01}
                        value={montoEdicion}
                        onChange={(e) => setMontoEdicion(e.target.value)}
                        style={{ width: 90, padding: '2px 4px', fontSize: 12 }}
                        autoFocus
                      />
                    ) : (
                      <>
                        {Number(m.monto).toFixed(2)}
                        {m.moneda_pago === 'USD' && (
                          <span style={{ fontSize: 10, fontWeight: 400, display: 'block' }}>
                            (USD {Number(m.monto_original).toFixed(2)} @ {Number(m.tipo_cambio_aplicado).toFixed(3)})
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color }}>{new Date(m.created_at).toLocaleTimeString()}</td>
                  <td style={esAdmin ? { ...tdStyle, color } : { ...tdStyle, color, borderRight: 'none' }}>
                    {editandoId === m.id ? (
                      <input
                        value={notasEdicion}
                        onChange={(e) => setNotasEdicion(e.target.value)}
                        style={{ width: 160, padding: '2px 4px', fontSize: 12 }}
                      />
                    ) : (
                      m.notas ?? ''
                    )}
                  </td>
                  {esAdmin && (
                    <td style={{ ...tdStyle, borderRight: 'none' }}>
                      {editandoId === m.id ? (
                        <span style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => guardarEdicion(m.id)}
                            disabled={guardando}
                            style={{ border: 'none', background: 'transparent', color: 'var(--brand)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditandoId(null)}
                            disabled={guardando}
                            style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => iniciarEdicion(m.id, Number(m.monto), m.metodo_pago, m.notas)}
                          style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sesion.movimientos.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay movimientos en este turno.</p>
      )}
    </div>
  );
}

function agruparYSumar<T>(items: T[], clave: (item: T) => string): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const item of items as unknown as { monto: number }[]) {
    const k = clave(item as unknown as T);
    mapa.set(k, (mapa.get(k) ?? 0) + Number(item.monto));
  }
  return [...mapa.entries()];
}

function exportarLiquidacionPDF(sesion: SesionCaja, hotelNombre: string, personalNombre: string | null) {
  const fmt = (n: number) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const saldoFinal = sesion.estado === 'cerrada' && sesion.saldo_final != null ? sesion.saldo_final : sesion.saldoActual;

  const ingresos = sesion.movimientos.filter((m) => m.tipo === 'ingreso');
  const egresos = sesion.movimientos.filter((m) => m.tipo === 'egreso');

  const ingresosPorMetodo = agruparYSumar(ingresos, (m) => m.metodo_pago);
  const egresosPorConcepto = agruparYSumar(egresos, (m) => m.concepto);

  const filaMetodo = (nombre: string, monto: number) => `
    <tr><td>${escapeHtml(nombre)}</td><td style="text-align:right">${fmt(monto)}</td></tr>
  `;

  const filasIngresosResumen = [
    filaMetodo('Saldo inicial', Number(sesion.saldo_inicial)),
    ...ingresosPorMetodo.map(([metodo, monto]) => filaMetodo(METODO_LABEL[metodo] ?? metodo, monto)),
    `<tr class="total"><td>Total ingresos</td><td style="text-align:right">${fmt(sesion.totalIngresos)}</td></tr>`,
  ].join('');

  const filasEgresosResumen =
    egresosPorConcepto.length > 0
      ? [
          ...egresosPorConcepto.map(([concepto, monto]) => filaMetodo(concepto, monto)),
          `<tr class="total"><td>Total egresos</td><td style="text-align:right">${fmt(sesion.totalEgresos)}</td></tr>`,
        ].join('')
      : '<tr><td colspan="2" class="vacio">Sin egresos registrados</td></tr>';

  const filaDetalle = (m: MovimientoCaja) => `
    <tr>
      <td>${new Date(m.created_at).toLocaleString('es-PE')}</td>
      <td>${escapeHtml(m.concepto)}</td>
      <td>${METODO_LABEL[m.metodo_pago] ?? escapeHtml(m.metodo_pago)}</td>
      <td style="text-align:right">${fmt(m.monto)}</td>
      <td>${m.notas ? escapeHtml(m.notas) : ''}</td>
    </tr>
  `;

  const filasIngresosDetalle = ingresos.length > 0
    ? ingresos.map(filaDetalle).join('')
    : '<tr><td colspan="5" class="vacio">Sin ingresos registrados</td></tr>';
  const filasEgresosDetalle = egresos.length > 0
    ? egresos.map(filaDetalle).join('')
    : '<tr><td colspan="5" class="vacio">Sin egresos registrados</td></tr>';

  // El resumen general es la liquidación real de caja: solo efectivo (lo
  // único que el recepcionista recibe/entrega en mano). Yape/tarjeta/
  // transferencia van directo a la cuenta de la empresa y ya se ven
  // desglosados arriba, en "Ingresos - Resumen por método".
  const totalIngresosEfectivo = ingresos
    .filter((m) => m.metodo_pago === 'efectivo')
    .reduce((acc, m) => acc + Number(m.monto), 0);
  const totalEgresosEfectivo = egresos
    .filter((m) => m.metodo_pago === 'efectivo')
    .reduce((acc, m) => acc + Number(m.monto), 0);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Liquidación de caja</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 28px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 17px; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px; }
  .hotel { text-align: center; font-size: 12px; color: #5f6068; margin: 0 0 14px; }
  .meta { text-align: center; font-size: 12px; color: #333; margin: 0 0 22px; padding-bottom: 12px; border-bottom: 2px solid #1a1a1a; }
  .meta b { color: #000; }
  h2 { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.3px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #1a1a1a; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; color: #5f6068; padding: 5px 8px; border-bottom: 1px solid #1a1a1a; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e2e2; }
  th:last-child, td:last-child { text-align: left; }
  table.resumen-tabla th:nth-child(2), table.resumen-tabla td:nth-child(2) { text-align: right; }
  tr.total td { font-weight: 700; border-top: 1.5px solid #1a1a1a; border-bottom: none; }
  td.vacio { color: #8a8b91; font-style: italic; }
  .caja-total { display: inline-block; float: right; margin-top: -6px; background: #f0efe9; border: 1px solid #1a1a1a; border-radius: 4px; padding: 6px 14px; font-weight: 700; font-size: 13px; }
  .clear { clear: both; }
  .resumen-general { margin-top: 26px; border: 1.5px solid #1a1a1a; border-radius: 6px; padding: 16px 20px; page-break-inside: avoid; }
  .resumen-general h2 { margin-top: 0; border: none; text-align: center; }
  .fila { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .fila.destacada { border-top: 1.5px solid #1a1a1a; margin-top: 8px; padding-top: 10px; font-size: 16px; font-weight: 700; }
  .ingreso { color: #173404; }
  .egreso { color: #7a1414; }
  .firma { display: flex; justify-content: space-between; margin-top: 60px; }
  .firma div { width: 45%; border-top: 1px solid #1a1a1a; padding-top: 6px; text-align: center; font-size: 11px; color: #5f6068; }
  @media print {
    body { padding: 10mm; }
    .resumen-general { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>Liquidación de caja — Recepción</h1>
  <p class="hotel">${escapeHtml(hotelNombre)}</p>
  <p class="meta">
    <b>Fecha:</b> ${new Date(sesion.abierta_en).toLocaleDateString('es-PE')}
    &nbsp;|&nbsp; <b>Turno:</b> ${escapeHtml(sesion.turnos?.nombre ?? '—')}
    &nbsp;|&nbsp; <b>Responsable:</b> ${escapeHtml(personalNombre ?? '—')}
    &nbsp;|&nbsp; <b>Estado:</b> ${sesion.estado === 'cerrada' ? 'Turno cerrado' : 'Turno abierto'}
  </p>

  <h2>Ingresos — Resumen por método</h2>
  <table class="resumen-tabla">
    <thead><tr><th>Método</th><th>Monto (S/)</th></tr></thead>
    <tbody>${filasIngresosResumen}</tbody>
  </table>
  <span class="caja-total">S/ ${fmt(Number(sesion.saldo_inicial) + sesion.totalIngresos)}</span>
  <div class="clear"></div>

  <h2>Ingresos — Detalle</h2>
  <table>
    <thead><tr><th>Fecha y hora</th><th>Concepto</th><th>Método</th><th style="text-align:right">Monto (S/)</th><th>Notas</th></tr></thead>
    <tbody>${filasIngresosDetalle}</tbody>
  </table>

  <h2>Egresos — Resumen por motivo</h2>
  <table class="resumen-tabla">
    <thead><tr><th>Motivo</th><th>Monto (S/)</th></tr></thead>
    <tbody>${filasEgresosResumen}</tbody>
  </table>
  <span class="caja-total">S/ ${fmt(sesion.totalEgresos)}</span>
  <div class="clear"></div>

  <h2>Egresos — Detalle</h2>
  <table>
    <thead><tr><th>Fecha y hora</th><th>Motivo</th><th>Método</th><th style="text-align:right">Monto (S/)</th><th>Notas</th></tr></thead>
    <tbody>${filasEgresosDetalle}</tbody>
  </table>

  <div class="resumen-general">
    <h2>Resumen general (solo efectivo)</h2>
    <div class="fila"><span>Saldo inicial</span><span>S/ ${fmt(sesion.saldo_inicial)}</span></div>
    <div class="fila ingreso"><span>Total ingresos</span><span>S/ ${fmt(totalIngresosEfectivo)}</span></div>
    <div class="fila egreso"><span>Total egresos</span><span>S/ ${fmt(totalEgresosEfectivo)}</span></div>
    <div class="fila destacada"><span>${sesion.estado === 'cerrada' ? 'Saldo final' : 'Saldo actual'}</span><span>S/ ${fmt(saldoFinal)}</span></div>
  </div>

  <div class="firma">
    <div>Entrega (${escapeHtml(personalNombre ?? 'Responsable')})</div>
    <div>Recibe</div>
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

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

const thStyle: CSSProperties = {
  padding: '8px',
  fontWeight: 700,
  background: 'var(--table-header-bg-caja)',
  color: 'var(--table-header-text-caja)',
  borderRight: '2px solid var(--table-header-border-caja)',
  borderBottom: '2px solid var(--table-header-border-caja)',
};
const tdStyle: CSSProperties = {
  padding: '8px',
  color: 'var(--text-secondary)',
  borderRight: '2px solid var(--table-border)',
};

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

const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};
