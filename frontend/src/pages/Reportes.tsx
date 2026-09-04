import { useEffect, useState, type CSSProperties } from 'react';
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
}

interface ConceptoMonto {
  concepto: string;
  monto: number;
}

interface SesionReporte {
  id: string;
  turno: { nombre: string; hora_inicio: string; hora_fin: string } | null;
  recepcionista: string;
  estado: 'abierta' | 'cerrada';
  abiertaEn: string;
  cerradaEn: string | null;
  saldoInicial: number;
  saldoFinal: number | null;
  saldoActual: number;
  totalIngresos: number;
  totalEgresos: number;
  ingresosPorConcepto: ConceptoMonto[];
  egresosPorConcepto: ConceptoMonto[];
  movimientos: MovimientoCaja[];
}

interface ReporteCaja {
  fecha: string;
  turnoId: string | null;
  sesiones: SesionReporte[];
  resumen: {
    saldoInicialDia: number | null;
    saldoActualDia: number | null;
    totalIngresos: number;
    totalEgresos: number;
    ingresosPorConcepto: ConceptoMonto[];
    egresosPorConcepto: ConceptoMonto[];
  };
}

interface FilaVentas {
  etiqueta: string;
  valores: number[];
  total: number;
}

interface ReporteVentas {
  dias: string[];
  porMetodo: FilaVentas[];
  totalesPorDiaMetodo: number[];
  totalMetodo: number;
  porTipo: FilaVentas[];
  totalesPorDiaTipo: number[];
  totalTipo: number;
}

interface ReporteAnticipos {
  dias: string[];
  porMetodo: FilaVentas[];
  totalesPorDiaMetodo: number[];
  totalMetodo: number;
}

interface FilaMatrizOcupabilidad {
  habitacionId: string;
  habNumero: number;
  piso: number;
  ocupacionPorDia: boolean[];
  diasOcupados: number;
}

interface MatrizOcupabilidad {
  dias: string[];
  habitaciones: FilaMatrizOcupabilidad[];
  totalesPorDia: number[];
  promedioPorDia: number;
  promedioPorHabitacion: number;
}

interface ReporteOcupabilidad {
  desde: string;
  hasta: string;
  ingresosTotales: number;
  diasOcupados: number;
  ocupabilidad: number;
  matriz: MatrizOcupabilidad;
}

// Mismo criterio que el backend (ver comoRelojLima en estadias.service.ts /
// caja.service.ts): sesiones_turno.fecha se guarda en hora de Lima, así que
// "hoy" por defecto también debe calcularse en hora de Lima -- si se usa la
// fecha UTC del navegador, entre las 7pm y medianoche (Lima) ya cae en el
// día siguiente en UTC y el filtro por defecto no encontraría nada.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function fechaHoy(): string {
  return new Date(Date.now() - PERU_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

function inicioDeMes(fechaYMD: string): string {
  return `${fechaYMD.slice(0, 7)}-01`;
}

function sumarDiasYMD(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// "20 ago" -- corto a propósito, porque el rango puede tener muchas columnas.
function fechaCorta(fechaYMD: string): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const texto = new Date(Date.UTC(anio, mes - 1, dia)).toLocaleDateString('es-PE', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  });
  return texto.replace('.', '');
}

function formatoPEN(n: number): string {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Reportes() {
  const { hotelActual } = useHotel();
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [fecha, setFecha] = useState(fechaHoy());
  const [turnoId, setTurnoId] = useState('');
  const [reporte, setReporte] = useState<ReporteCaja | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ventas diarias: por defecto, los últimos 7 días (hoy incluido).
  const [ventasDesde, setVentasDesde] = useState(sumarDiasYMD(fechaHoy(), -6));
  const [ventasHasta, setVentasHasta] = useState(fechaHoy());
  const [ventas, setVentas] = useState<ReporteVentas | null>(null);
  const [ventasLoading, setVentasLoading] = useState(true);
  const [ventasError, setVentasError] = useState<string | null>(null);

  // Anticipos: mismo criterio por defecto que ventas diarias (últimos 7 días).
  const [anticiposDesde, setAnticiposDesde] = useState(sumarDiasYMD(fechaHoy(), -6));
  const [anticiposHasta, setAnticiposHasta] = useState(fechaHoy());
  const [anticipos, setAnticipos] = useState<ReporteAnticipos | null>(null);
  const [anticiposLoading, setAnticiposLoading] = useState(true);
  const [anticiposError, setAnticiposError] = useState<string | null>(null);

  // Ocupabilidad: por defecto, desde el inicio del mes hasta hoy.
  const [ocupDesde, setOcupDesde] = useState(inicioDeMes(fechaHoy()));
  const [ocupHasta, setOcupHasta] = useState(fechaHoy());
  const [ocupabilidad, setOcupabilidad] = useState<ReporteOcupabilidad | null>(null);
  const [ocupLoading, setOcupLoading] = useState(true);
  const [ocupError, setOcupError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelActual || hotelActual.rol !== 'admin') return;
    api
      .get<Turno[]>(`/hoteles/${hotelActual.hotelId}/caja/turnos`)
      .then(setTurnos)
      .catch(() => {});
  }, [hotelActual]);

  useEffect(() => {
    if (!hotelActual || hotelActual.rol !== 'admin') return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ fecha });
    if (turnoId) params.set('turnoId', turnoId);
    api
      .get<ReporteCaja>(`/hoteles/${hotelActual.hotelId}/reportes/caja?${params.toString()}`)
      .then(setReporte)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar el reporte'))
      .finally(() => setLoading(false));
  }, [hotelActual, fecha, turnoId]);

  useEffect(() => {
    if (!hotelActual || hotelActual.rol !== 'admin' || !ventasDesde || !ventasHasta) return;
    // Un rango más ancho tarda más en resolver en el backend -- si el
    // usuario cambia las fechas rápido, la respuesta de un pedido anterior
    // (ya obsoleto) puede llegar después que la del rango actual y pisar el
    // resultado correcto. `vigente` descarta cualquier respuesta que no sea
    // la del último pedido en curso.
    let vigente = true;
    setVentasLoading(true);
    setVentasError(null);
    api
      .get<ReporteVentas>(
        `/hoteles/${hotelActual.hotelId}/reportes/ventas-diarias?desde=${ventasDesde}&hasta=${ventasHasta}`,
      )
      .then((data) => {
        if (vigente) setVentas(data);
      })
      .catch((err) => {
        if (vigente) setVentasError(err instanceof ApiError ? err.message : 'No se pudo cargar el reporte');
      })
      .finally(() => {
        if (vigente) setVentasLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [hotelActual, ventasDesde, ventasHasta]);

  useEffect(() => {
    if (!hotelActual || hotelActual.rol !== 'admin' || !anticiposDesde || !anticiposHasta) return;
    let vigente = true;
    setAnticiposLoading(true);
    setAnticiposError(null);
    api
      .get<ReporteAnticipos>(
        `/hoteles/${hotelActual.hotelId}/reportes/anticipos?desde=${anticiposDesde}&hasta=${anticiposHasta}`,
      )
      .then((data) => {
        if (vigente) setAnticipos(data);
      })
      .catch((err) => {
        if (vigente) setAnticiposError(err instanceof ApiError ? err.message : 'No se pudo cargar el reporte');
      })
      .finally(() => {
        if (vigente) setAnticiposLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [hotelActual, anticiposDesde, anticiposHasta]);

  useEffect(() => {
    if (!hotelActual || hotelActual.rol !== 'admin' || !ocupDesde || !ocupHasta) return;
    let vigente = true;
    setOcupLoading(true);
    setOcupError(null);
    api
      .get<ReporteOcupabilidad>(
        `/hoteles/${hotelActual.hotelId}/reportes/ocupabilidad?desde=${ocupDesde}&hasta=${ocupHasta}`,
      )
      .then((data) => {
        if (vigente) setOcupabilidad(data);
      })
      .catch((err) => {
        if (vigente) setOcupError(err instanceof ApiError ? err.message : 'No se pudo cargar el reporte');
      })
      .finally(() => {
        if (vigente) setOcupLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [hotelActual, ocupDesde, ocupHasta]);

  if (!hotelActual) return null;

  if (hotelActual.rol !== 'admin') {
    return <p style={{ color: 'var(--text-muted)' }}>Solo un administrador puede ver esta sección.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ fontSize: 20 }}>Reportes</h1>

      <div>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>Caja de recepcionistas</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Movimientos de dinero de todas las recepcionistas para la fecha y el turno seleccionados.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Fecha
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Turno
            <select value={turnoId} onChange={(e) => setTurnoId(e.target.value)} style={inputStyle}>
              <option value="">Todos los turnos</option>
              {turnos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} ({t.hora_inicio.slice(0, 5)}–{t.hora_fin.slice(0, 5)})
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</p>}
        {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}

        {!loading && reporte && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <MetricCard
                label="Saldo inicial del día"
                value={reporte.resumen.saldoInicialDia !== null ? `PEN ${reporte.resumen.saldoInicialDia.toFixed(2)}` : '—'}
              />
              <MetricCard label="Total ingresos" value={`PEN ${reporte.resumen.totalIngresos.toFixed(2)}`} />
              <MetricCard label="Total egresos" value={`PEN ${reporte.resumen.totalEgresos.toFixed(2)}`} />
              <MetricCard
                label="Neto del día"
                value={`PEN ${(reporte.resumen.totalIngresos - reporte.resumen.totalEgresos).toFixed(2)}`}
              />
              <MetricCard
                label="Saldo actual"
                value={reporte.resumen.saldoActualDia !== null ? `PEN ${reporte.resumen.saldoActualDia.toFixed(2)}` : '—'}
                destacado
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
              <ConceptoTabla titulo="Ingresos por concepto" items={reporte.resumen.ingresosPorConcepto} color="var(--ingreso)" />
              <ConceptoTabla titulo="Egresos por concepto" items={reporte.resumen.egresosPorConcepto} color="var(--egreso)" />
            </div>

            {reporte.sesiones.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>No hay sesiones de caja para esa fecha y turno.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {reporte.sesiones.map((s) => (
                <SesionCard key={s.id} sesion={s} />
              ))}
            </div>
          </>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>Ventas diarias</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Ingresos de todo el hotel (todas las recepcionistas y turnos) en el rango de fechas seleccionado.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Desde
            <input
              type="date"
              value={ventasDesde}
              max={ventasHasta}
              onChange={(e) => setVentasDesde(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Hasta
            <input
              type="date"
              value={ventasHasta}
              min={ventasDesde}
              onChange={(e) => setVentasHasta(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        {ventasError && <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{ventasError}</p>}
        {ventasLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}

        {!ventasLoading && ventas && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <TablaVentas
              titulo="Ingresos por método de pago"
              dias={ventas.dias}
              filas={ventas.porMetodo.map((f) => ({ ...f, etiqueta: METODO_LABEL[f.etiqueta] ?? f.etiqueta }))}
              totalesPorDia={ventas.totalesPorDiaMetodo}
              total={ventas.totalMetodo}
            />
            <TablaVentas
              titulo="Ingresos por tipo"
              dias={ventas.dias}
              filas={ventas.porTipo}
              totalesPorDia={ventas.totalesPorDiaTipo}
              total={ventas.totalTipo}
            />
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>Anticipos</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Pagos adelantados de reserva de todo el hotel en el rango seleccionado, por método de pago. Los que no son
          en efectivo no pasan por la caja de ninguna recepcionista, así que no aparecen en "Ventas diarias".
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Desde
            <input
              type="date"
              value={anticiposDesde}
              max={anticiposHasta}
              onChange={(e) => setAnticiposDesde(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Hasta
            <input
              type="date"
              value={anticiposHasta}
              min={anticiposDesde}
              onChange={(e) => setAnticiposHasta(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        {anticiposError && <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{anticiposError}</p>}
        {anticiposLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}

        {!anticiposLoading && anticipos && (
          <TablaVentas
            titulo="Anticipos por método de pago"
            dias={anticipos.dias}
            filas={anticipos.porMetodo.map((f) => ({ ...f, etiqueta: METODO_LABEL[f.etiqueta] ?? f.etiqueta }))}
            totalesPorDia={anticipos.totalesPorDiaMetodo}
            total={anticipos.totalMetodo}
          />
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>Ocupabilidad</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
          Ingresos generados entre la suma de días hospedados de las estadías cuyo check-in cayó en el rango
          seleccionado.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Desde
            <input
              type="date"
              value={ocupDesde}
              max={ocupHasta}
              onChange={(e) => setOcupDesde(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            Hasta
            <input
              type="date"
              value={ocupHasta}
              min={ocupDesde}
              onChange={(e) => setOcupHasta(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        {ocupError && <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{ocupError}</p>}
        {ocupLoading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}

        {!ocupLoading && ocupabilidad && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <MetricCard label="Ingresos totales" value={`PEN ${formatoPEN(ocupabilidad.ingresosTotales)}`} />
              <MetricCard label="Días ocupados" value={`${ocupabilidad.diasOcupados}`} />
              <MetricCard
                label="Ocupabilidad (PEN / día)"
                value={`PEN ${formatoPEN(ocupabilidad.ocupabilidad)}`}
                destacado
              />
            </div>

            <MatrizOcupabilidadTabla matriz={ocupabilidad.matriz} />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <MetricCard
                label="Promedio de ocupabilidad por día"
                value={`${ocupabilidad.matriz.promedioPorDia.toFixed(1)} hab./día`}
                destacado
              />
              <MetricCard
                label="Promedio de ocupabilidad por habitación"
                value={`${ocupabilidad.matriz.promedioPorHabitacion.toFixed(1)} días/hab.`}
                destacado
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MatrizOcupabilidadTabla({ matriz }: { matriz: MatrizOcupabilidad }) {
  const totalCeldasOcupadas = matriz.totalesPorDia.reduce((a, b) => a + b, 0);

  if (matriz.habitaciones.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>No hay habitaciones disponibles (sin contar bloqueadas).</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Ocupación por habitación y día</p>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ ...thVentasStyle, position: 'sticky', left: 0, textAlign: 'left', background: 'var(--surface-2)' }}>
                Habitación
              </th>
              {matriz.dias.map((d) => (
                <th key={d} style={thVentasStyle}>
                  {fechaCorta(d)}
                </th>
              ))}
              <th style={{ ...thVentasStyle, background: 'var(--surface-2)' }}>Días ocupados</th>
            </tr>
          </thead>
          <tbody>
            {matriz.habitaciones.map((h) => (
              <tr key={h.habitacionId}>
                <td
                  style={{
                    ...tdVentasStyle,
                    position: 'sticky',
                    left: 0,
                    textAlign: 'left',
                    fontWeight: 600,
                    background: 'var(--surface-1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h.habNumero}
                </td>
                {h.ocupacionPorDia.map((ocupado, j) => (
                  <td
                    key={j}
                    style={{
                      ...tdVentasStyle,
                      background: ocupado ? 'var(--ocupada-bg)' : 'transparent',
                      color: ocupado ? 'var(--ocupada-text)' : 'var(--text-muted)',
                      fontWeight: ocupado ? 700 : 400,
                    }}
                  >
                    {ocupado ? '●' : ''}
                  </td>
                ))}
                <td style={{ ...tdVentasStyle, fontWeight: 700, background: 'var(--brand-bg)' }}>{h.diasOcupados}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <td
                style={{
                  ...tdVentasStyle,
                  position: 'sticky',
                  left: 0,
                  textAlign: 'left',
                  fontWeight: 700,
                  background: 'var(--surface-2)',
                  whiteSpace: 'nowrap',
                }}
              >
                Habitaciones ocupadas
              </td>
              {matriz.totalesPorDia.map((v, j) => (
                <td key={j} style={{ ...tdVentasStyle, fontWeight: 700, background: 'var(--surface-2)' }}>
                  {v}
                </td>
              ))}
              <td style={{ ...tdVentasStyle, fontWeight: 700, background: 'var(--brand)', color: '#fff' }}>
                {totalCeldasOcupadas}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TablaVentas({
  titulo,
  dias,
  filas,
  totalesPorDia,
  total,
}: {
  titulo: string;
  dias: string[];
  filas: FilaVentas[];
  totalesPorDia: number[];
  total: number;
}) {
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{titulo}</p>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: 480 }}>
          <thead>
            <tr>
              <th style={{ ...thVentasStyle, position: 'sticky', left: 0, textAlign: 'left', background: 'var(--surface-2)' }}>
                &nbsp;
              </th>
              {dias.map((d) => (
                <th key={d} style={thVentasStyle}>
                  {fechaCorta(d)}
                </th>
              ))}
              <th style={{ ...thVentasStyle, background: 'var(--surface-2)' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.etiqueta} style={{ background: i % 2 === 1 ? 'var(--ingreso-bg)' : 'transparent' }}>
                <td
                  style={{
                    ...tdVentasStyle,
                    position: 'sticky',
                    left: 0,
                    textAlign: 'left',
                    fontWeight: 600,
                    background: i % 2 === 1 ? 'var(--ingreso-bg)' : 'var(--surface-1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.etiqueta}
                </td>
                {f.valores.map((v, j) => (
                  <td key={j} style={tdVentasStyle}>
                    {v > 0 ? formatoPEN(v) : '—'}
                  </td>
                ))}
                <td style={{ ...tdVentasStyle, fontWeight: 700, background: 'var(--brand-bg)' }}>
                  {formatoPEN(f.total)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
              <td
                style={{
                  ...tdVentasStyle,
                  position: 'sticky',
                  left: 0,
                  textAlign: 'left',
                  fontWeight: 700,
                  background: 'var(--surface-2)',
                  whiteSpace: 'nowrap',
                }}
              >
                Total
              </td>
              {totalesPorDia.map((v, j) => (
                <td key={j} style={{ ...tdVentasStyle, fontWeight: 700, background: 'var(--surface-2)' }}>
                  {formatoPEN(v)}
                </td>
              ))}
              <td style={{ ...tdVentasStyle, fontWeight: 700, background: 'var(--brand)', color: '#fff' }}>
                {formatoPEN(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SesionCard({ sesion }: { sesion: SesionReporte }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div>
          <p style={{ fontWeight: 600, margin: 0 }}>{sesion.recepcionista}</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0' }}>
            {sesion.turno?.nombre ?? '—'} ({sesion.turno?.hora_inicio.slice(0, 5)}–{sesion.turno?.hora_fin.slice(0, 5)})
          </p>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            height: 'fit-content',
          }}
        >
          {sesion.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <MetricCard label="Saldo inicial" value={`PEN ${sesion.saldoInicial.toFixed(2)}`} chico />
        <MetricCard label="Ingresos" value={`PEN ${sesion.totalIngresos.toFixed(2)}`} chico />
        <MetricCard label="Egresos" value={`PEN ${sesion.totalEgresos.toFixed(2)}`} chico />
        <MetricCard
          label={sesion.estado === 'cerrada' ? 'Saldo final' : 'Saldo actual'}
          value={`PEN ${(sesion.estado === 'cerrada' && sesion.saldoFinal !== null ? sesion.saldoFinal : sesion.saldoActual).toFixed(2)}`}
          chico
          destacado
        />
      </div>

      {sesion.movimientos.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin movimientos en esta sesión.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Concepto</th>
                <th style={thStyle}>Método</th>
                <th style={thStyle}>Monto</th>
                <th style={thStyle}>Hora</th>
                <th style={thStyle}>Notas</th>
              </tr>
            </thead>
            <tbody>
              {sesion.movimientos.map((m) => {
                const color = m.tipo === 'ingreso' ? 'var(--ingreso)' : 'var(--egreso)';
                const bg = m.tipo === 'ingreso' ? 'var(--ingreso-bg)' : 'var(--egreso-bg)';
                return (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)', background: bg }}>
                    <td style={{ ...tdStyle, color, fontWeight: 500 }}>{m.tipo}</td>
                    <td style={{ ...tdStyle, color }}>{m.concepto}</td>
                    <td style={{ ...tdStyle, color }}>{METODO_LABEL[m.metodo_pago] ?? m.metodo_pago}</td>
                    <td style={{ ...tdStyle, color, fontWeight: 600 }}>{Number(m.monto).toFixed(2)}</td>
                    <td style={{ ...tdStyle, color }}>{new Date(m.created_at).toLocaleTimeString()}</td>
                    <td style={{ ...tdStyle, color }}>{m.notas ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConceptoTabla({ titulo, items, color }: { titulo: string; items: ConceptoMonto[]; color: string }) {
  return (
    <div style={{ flex: '1 1 280px', minWidth: 260 }}>
      <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>{titulo}</p>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin movimientos.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {items.map((it) => (
              <tr key={it.concepto} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{it.concepto}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color }}>
                  PEN {it.monto.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  destacado,
  chico,
}: {
  label: string;
  value: string;
  destacado?: boolean;
  chico?: boolean;
}) {
  return (
    <div
      style={{
        background: destacado ? 'var(--brand-bg)' : 'var(--surface-1)',
        borderRadius: 'var(--radius)',
        padding: chico ? '8px 12px' : '12px 16px',
        flex: '1 1 130px',
        minWidth: 130,
      }}
    >
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{label}</p>
      <p
        style={{
          fontSize: chico ? 15 : 20,
          fontWeight: 500,
          margin: '4px 0 0',
          color: destacado ? 'var(--brand)' : 'var(--text-primary)',
        }}
      >
        {value}
      </p>
    </div>
  );
}

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const thStyle: CSSProperties = { padding: '6px 8px' };
const tdStyle: CSSProperties = { padding: '8px', color: 'var(--text-secondary)' };

const thVentasStyle: CSSProperties = {
  padding: '8px 10px',
  textAlign: 'right',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  borderBottom: '2px solid var(--border-strong)',
  whiteSpace: 'nowrap',
};
const tdVentasStyle: CSSProperties = {
  padding: '7px 10px',
  textAlign: 'right',
  color: 'var(--text-secondary)',
  borderTop: '1px solid var(--border)',
};
