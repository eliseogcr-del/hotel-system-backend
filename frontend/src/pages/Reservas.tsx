import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { buscarHuespedPorDni, crearHuesped } from '../lib/huespedes';
import { ReservaFormModal } from '../components/ReservaFormModal';

interface Habitacion {
  id: string;
  hab_numero: number;
  estado: string;
  tipos_habitacion: { id: string; nombre: string; aforo_max?: number } | null;
}

interface TipoHabitacionPrecios {
  id: string;
  nombre: string;
  precio_normal: number;
  precio_corporativo: number;
  precio_web: number;
  precio_por_hora: number | null;
  precio_costo: number;
}

type TipoCliente = 'normal' | 'corporativo' | 'web';

function precioSegunTipoCliente(
  precios: TipoHabitacionPrecios | undefined,
  tipoCliente: TipoCliente,
  tipoAlquiler: 'pernocte' | 'por_horas',
): number {
  if (!precios) return 0;
  if (tipoAlquiler === 'por_horas') return Number(precios.precio_por_hora ?? 0);
  if (tipoCliente === 'corporativo') return Number(precios.precio_corporativo);
  if (tipoCliente === 'web') return Number(precios.precio_web);
  return Number(precios.precio_normal);
}

interface Reserva {
  id: string;
  origen: string;
  fecha_ingreso: string;
  dias_hospedaje: number;
  estado: string;
  importe_final: number | null;
  moneda: string;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
}

const ESTADOS = ['pendiente_revision', 'confirmada', 'cancelada'];
const ORIGENES = ['telefono', 'whatsapp', 'booking', 'airbnb', 'directo', 'walkin'];

interface ReservaCalendario {
  id: string;
  habitacionId: string;
  checkinPrevisto: string;
  checkoutPrevisto: string;
  reservaId: string;
  estadoReserva: string;
  estadiaId: string | null;
  estadoEstadia: string | null;
  huesped: string;
}

function fechaYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hoyYMD(): string {
  return fechaYMD(new Date());
}

function sumarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fechaYMD(d);
}

function rangoFechas(desde: string, hasta: string): Date[] {
  const dias: Date[] = [];
  let cur = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  while (cur <= fin) {
    dias.push(new Date(cur));
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return dias;
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function Reservas() {
  const { hotelActual } = useHotel();
  const navigate = useNavigate();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [tiposHabitacion, setTiposHabitacion] = useState<TipoHabitacionPrecios[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [vista, setVista] = useState<'calendario' | 'lista'>('calendario');
  // Persistido en localStorage (igual que la vista de Habitaciones.tsx):
  // si alguien deja el rango en, por ejemplo, la semana que viene y la
  // página se recarga de verdad (no solo el bug de sesión ya corregido en
  // AuthContext.tsx), el calendario reabre en ese mismo rango en vez de
  // saltar de nuevo a "hoy + 10 días".
  const [desde, setDesde] = useState(() => localStorage.getItem('reservas_desde') || hoyYMD());
  const [hasta, setHasta] = useState(
    () => localStorage.getItem('reservas_hasta') || sumarDias(hoyYMD(), 10),
  );

  function cambiarDesde(v: string) {
    setDesde(v);
    localStorage.setItem('reservas_desde', v);
  }

  function cambiarHasta(v: string) {
    setHasta(v);
    localStorage.setItem('reservas_hasta', v);
  }
  const [calendario, setCalendario] = useState<ReservaCalendario[]>([]);
  const [calendarioLoading, setCalendarioLoading] = useState(false);
  const [calendarioError, setCalendarioError] = useState<string | null>(null);
  // Aparte de calendarioError (que oculta toda la tabla mientras esté seteado,
  // ver CalendarioReservas más abajo): un aviso liviano al hacer clic en una
  // celda vacía de una habitación bloqueada, sin tapar el calendario.
  const [avisoBloqueada, setAvisoBloqueada] = useState<string | null>(null);
  const [precioMascotaDia, setPrecioMascotaDia] = useState(0);
  const [horaCheckinHotel, setHoraCheckinHotel] = useState<string | undefined>(undefined);

  const [formulario, setFormulario] = useState<{
    modo: 'crear' | 'editar';
    habitacionId: string;
    habNumero: number;
    aforoMax: number;
    fechaInicial?: string;
    reservaId?: string;
    lineaId?: string;
  } | null>(null);

  function recargarCalendario() {
    if (!hotelActual || !desde || !hasta) return;
    api
      .get<ReservaCalendario[]>(`/hoteles/${hotelActual.hotelId}/reservas/calendario?desde=${desde}&hasta=${hasta}`)
      .then(setCalendario)
      .catch(() => {});
  }

  function cargarReservas() {
    if (!hotelActual) return;
    setLoading(true);
    const query = filtroEstado ? `?estado=${filtroEstado}` : '';
    api
      .get<Reserva[]>(`/hoteles/${hotelActual.hotelId}/reservas${query}`)
      .then(setReservas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargarReservas, [hotelActual, filtroEstado]);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch(() => {});
    api
      .get<TipoHabitacionPrecios[]>(`/hoteles/${hotelActual.hotelId}/tipos-habitacion`)
      .then(setTiposHabitacion)
      .catch(() => {});
    api
      .get<{ precio_mascota: number; hora_checkin: string }>(`/hoteles/${hotelActual.hotelId}`)
      .then((h) => {
        setPrecioMascotaDia(Number(h.precio_mascota ?? 0));
        setHoraCheckinHotel(h.hora_checkin?.slice(0, 5));
      })
      .catch(() => {});
  }, [hotelActual]);

  useEffect(() => {
    if (!hotelActual || !desde || !hasta) return;
    setCalendarioLoading(true);
    setCalendarioError(null);
    api
      .get<ReservaCalendario[]>(`/hoteles/${hotelActual.hotelId}/reservas/calendario?desde=${desde}&hasta=${hasta}`)
      .then(setCalendario)
      .catch((err) => setCalendarioError(err instanceof ApiError ? err.message : 'Error al cargar el calendario'))
      .finally(() => setCalendarioLoading(false));
  }, [hotelActual, desde, hasta]);

  function abrirFormularioCelda(hab: Habitacion, segmento: SegmentoCelda) {
    setAvisoBloqueada(null);
    if (segmento.ocupado) {
      if (segmento.estadoEstadia === 'en_curso' && segmento.estadiaId) {
        navigate(`/estadias/${segmento.estadiaId}`);
        return;
      }
      if (!segmento.reservaId || !segmento.lineaId) return;
      setFormulario({
        modo: 'editar',
        habitacionId: hab.id,
        habNumero: hab.hab_numero,
        aforoMax: hab.tipos_habitacion?.aforo_max ?? 0,
        reservaId: segmento.reservaId,
        lineaId: segmento.lineaId,
      });
    } else if (hab.estado === 'bloqueada') {
      // Bloqueada (fuera de servicio) no admite reservas en ninguna fecha
      // hasta que un admin la desbloquee desde Configuración -- mismo
      // criterio que el backend en DisponibilidadService.validar().
      setAvisoBloqueada(`La habitación ${hab.hab_numero} está bloqueada; no se pueden crear reservas ahí.`);
    } else {
      setFormulario({
        modo: 'crear',
        habitacionId: hab.id,
        habNumero: hab.hab_numero,
        aforoMax: hab.tipos_habitacion?.aforo_max ?? 0,
        fechaInicial: segmento.fechaInicio,
      });
    }
  }

  if (!hotelActual) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Reservas</h1>
        <button style={btnPrimary} onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Nueva reserva'}
        </button>
      </div>

      {mostrarForm && (
        <NuevaReservaForm
          hotelId={hotelActual.hotelId}
          habitaciones={habitaciones}
          tiposHabitacion={tiposHabitacion}
          onCreada={() => {
            setMostrarForm(false);
            cargarReservas();
            recargarCalendario();
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button
          onClick={() => setVista('calendario')}
          style={vista === 'calendario' ? btnToggleActivo : btnToggle}
        >
          Calendario
        </button>
        <button onClick={() => setVista('lista')} style={vista === 'lista' ? btnToggleActivo : btnToggle}>
          Lista
        </button>
      </div>

      {avisoBloqueada && (
        <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{avisoBloqueada}</p>
      )}

      {vista === 'calendario' && (
        <CalendarioReservas
          habitaciones={habitaciones}
          tiposHabitacion={tiposHabitacion}
          calendario={calendario}
          loading={calendarioLoading}
          error={calendarioError}
          desde={desde}
          hasta={hasta}
          onDesdeChange={cambiarDesde}
          onHastaChange={cambiarHasta}
          onCellClick={abrirFormularioCelda}
        />
      )}

      {formulario && hotelActual && (
        <ReservaFormModal
          hotelId={hotelActual.hotelId}
          habitacionId={formulario.habitacionId}
          habNumero={formulario.habNumero}
          aforoMax={formulario.aforoMax}
          tarifaSugerida={
            tiposHabitacion.find(
              (t) => t.id === habitaciones.find((h) => h.id === formulario.habitacionId)?.tipos_habitacion?.id,
            )?.precio_normal ?? 0
          }
          precioMascotaDia={precioMascotaDia}
          horaSugerida={horaCheckinHotel}
          modo={formulario.modo}
          fechaInicial={formulario.fechaInicial}
          reservaId={formulario.reservaId}
          lineaId={formulario.lineaId}
          onClose={() => setFormulario(null)}
          onGuardado={recargarCalendario}
        />
      )}

      {vista === 'lista' && (
        <>
          <div style={{ margin: '16px 0' }}>
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={selectStyle}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

          {!loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reservas.map((r) => (
                <Link
                  key={r.id}
                  to={`/reservas/${r.id}`}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '4px 12px',
                    padding: '10px 14px',
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    textDecoration: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                >
                  <span>
                    {r.huespedes ? `${r.huespedes.nombres} ${r.huespedes.apellidos}` : r.empresas?.razon_social ?? '—'}
                    {' · '}
                    <span style={{ color: 'var(--text-muted)' }}>{r.origen}</span>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {new Date(r.fecha_ingreso).toLocaleDateString()} · {r.dias_hospedaje}d
                  </span>
                  <span style={{ fontWeight: 500 }}>
                    {r.importe_final != null ? `${r.moneda} ${r.importe_final}` : '—'}
                  </span>
                  <EstadoBadge estado={r.estado} />
                </Link>
              ))}
              {reservas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay reservas.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface SegmentoCelda {
  span: number;
  ocupado: boolean;
  huesped: string;
  key: string | null;
  reservaId: string | null;
  lineaId: string | null;
  estadiaId: string | null;
  estadoEstadia: string | null;
  fechaInicio: string;
}

// Una celda de un día "partido" (checkout de una reserva con margen para
// otra el mismo día) nunca se fusiona con las vecinas, así que sus dos
// mitades siempre tienen span=1 -- no hace falta cargar ese campo aparte.
type CeldaRender =
  | { tipo: 'simple'; segmento: SegmentoCelda }
  | { tipo: 'partida'; saliente: SegmentoCelda; derecha: SegmentoCelda };

function CalendarioReservas({
  habitaciones,
  tiposHabitacion,
  calendario,
  loading,
  error,
  desde,
  hasta,
  onDesdeChange,
  onHastaChange,
  onCellClick,
}: {
  habitaciones: Habitacion[];
  tiposHabitacion: TipoHabitacionPrecios[];
  calendario: ReservaCalendario[];
  loading: boolean;
  error: string | null;
  desde: string;
  hasta: string;
  onDesdeChange: (v: string) => void;
  onHastaChange: (v: string) => void;
  onCellClick: (hab: Habitacion, segmento: SegmentoCelda) => void;
}) {
  const dias = useMemo(() => rangoFechas(desde, hasta), [desde, hasta]);

  const gruposMes = useMemo(() => {
    const grupos: { etiqueta: string; span: number }[] = [];
    for (const d of dias) {
      const etiqueta = capitalizar(d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }));
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.etiqueta === etiqueta) ultimo.span += 1;
      else grupos.push({ etiqueta, span: 1 });
    }
    return grupos;
  }, [dias]);

  const habitacionesOrdenadas = useMemo(
    () => [...habitaciones].sort((a, b) => a.hab_numero - b.hab_numero),
    [habitaciones],
  );

  const [mostrarTarifas, setMostrarTarifas] = useState(false);

  function segmentoDesde(item: ReservaCalendario, fechaInicio: string): SegmentoCelda {
    return {
      span: 1,
      ocupado: true,
      huesped: item.huesped,
      key: item.id,
      reservaId: item.reservaId,
      lineaId: item.id,
      estadiaId: item.estadiaId,
      estadoEstadia: item.estadoEstadia,
      fechaInicio,
    };
  }

  function segmentoLibre(fechaInicio: string): SegmentoCelda {
    return {
      span: 1,
      ocupado: false,
      huesped: '',
      key: null,
      reservaId: null,
      lineaId: null,
      estadiaId: null,
      estadoEstadia: null,
      fechaInicio,
    };
  }

  // El día en que un huésped hace checkout queda con margen (según el
  // tiempo de limpieza del tipo de habitación) para que otro huésped haga
  // checkin ESE MISMO día más tarde -- CajaService/DisponibilidadService ya
  // lo permite del lado del backend, pero antes el calendario pintaba todo
  // ese día como "ocupado" por la reserva saliente y el click siempre
  // abría su edición, sin dejar crear la reserva entrante. Ahora ese día
  // se parte en dos mitades: la que sale (izquierda) y la que entra o
  // queda libre para crear (derecha).
  function celdasHabitacion(habId: string): CeldaRender[] {
    const items = calendario.filter((c) => c.habitacionId === habId);

    function entranteDeDia(ymd: string): ReservaCalendario | undefined {
      return items.find((it) => {
        const ci = fechaYMD(new Date(it.checkinPrevisto));
        const co = fechaYMD(new Date(it.checkoutPrevisto));
        return ci === co ? ymd === ci : ymd >= ci && ymd < co;
      });
    }

    function salienteDeDia(ymd: string): ReservaCalendario | undefined {
      return items.find((it) => {
        const ci = fechaYMD(new Date(it.checkinPrevisto));
        const co = fechaYMD(new Date(it.checkoutPrevisto));
        // Reservas de un solo día (por horas) no cuentan como "salientes":
        // ya quedan cubiertas enteras por entranteDeDia.
        return ci !== co && ymd === co;
      });
    }

    const celdas: CeldaRender[] = [];
    for (const d of dias) {
      const ymd = fechaYMD(d);
      const saliente = salienteDeDia(ymd);
      const entrante = entranteDeDia(ymd);

      if (saliente) {
        celdas.push({
          tipo: 'partida',
          saliente: segmentoDesde(saliente, ymd),
          derecha: entrante ? segmentoDesde(entrante, ymd) : segmentoLibre(ymd),
        });
        continue;
      }

      const simple = entrante ? segmentoDesde(entrante, ymd) : segmentoLibre(ymd);
      const ultima = celdas[celdas.length - 1];
      // Solo se fusionan días OCUPADOS consecutivos de la misma reserva
      // (para pintar la barra tipo Gantt) y solo si ninguno es un día
      // partido. Los días vacíos nunca se fusionan entre sí -- cada uno
      // queda como su propia celda clickeable, para que el click abra el
      // formulario con la fecha exacta que se tocó.
      if (
        ultima?.tipo === 'simple' &&
        ultima.segmento.ocupado &&
        simple.ocupado &&
        ultima.segmento.key === simple.key
      ) {
        ultima.segmento.span += 1;
      } else {
        celdas.push({ tipo: 'simple', segmento: simple });
      }
    }
    return celdas;
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Desde</label>
          <input type="date" value={desde} onChange={(e) => onDesdeChange(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => onHastaChange(e.target.value)} style={inputStyle} />
        </div>
        <button type="button" onClick={() => setMostrarTarifas(true)} style={btnSecondary}>
          Ver tarifas
        </button>
      </div>

      {mostrarTarifas && (
        <TarifasModal tiposHabitacion={tiposHabitacion} onClose={() => setMostrarTarifas(false)} />
      )}

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', border: `2px solid ${CAL_BORDE}`, borderRadius: 'var(--radius)' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  style={{
                    ...thCalStyle,
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: 'var(--chrome-bg)',
                    color: '#fff',
                    width: 108,
                    maxWidth: 108,
                    padding: '6px 6px',
                    textAlign: 'left',
                    borderRight: `2px solid ${CAL_BORDE}`,
                  }}
                >
                  Habitación
                </th>
                {gruposMes.map((g, i) => (
                  <th
                    key={i}
                    colSpan={g.span}
                    style={{
                      ...thCalStyle,
                      background: 'var(--chrome-bg)',
                      color: '#fff',
                      textTransform: 'uppercase',
                      letterSpacing: 0.6,
                      borderRight: `2px solid ${CAL_BORDE}`,
                      borderBottom: `2px solid ${CAL_BORDE}`,
                    }}
                  >
                    {g.etiqueta}
                  </th>
                ))}
              </tr>
              <tr>
                {dias.map((d, i) => {
                  const finde = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th
                      key={i}
                      style={{
                        ...thCalStyle,
                        minWidth: 34,
                        background: finde ? 'var(--brand)' : CAL_HEADER_DIA,
                        color: '#fff',
                        fontSize: 13,
                      }}
                    >
                      {d.getDate()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {habitacionesOrdenadas.map((h, idxFila) => {
                const bloqueada = h.estado === 'bloqueada';
                return (
                <tr key={h.id} style={{ background: idxFila % 2 === 1 ? 'var(--ingreso-bg)' : 'transparent' }}>
                  <td
                    title={`${h.hab_numero} · ${h.tipos_habitacion?.nombre ?? ''}${bloqueada ? ' · Bloqueada' : ''}`}
                    style={{
                      ...tdCalStyle,
                      position: 'sticky',
                      left: 0,
                      background: idxFila % 2 === 1 ? 'var(--ingreso-bg)' : 'var(--surface-1)',
                      textAlign: 'left',
                      width: 108,
                      maxWidth: 108,
                      padding: '6px 6px',
                      overflow: 'hidden',
                      borderRight: `2px solid ${CAL_BORDE}`,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{h.hab_numero}</span>
                    {h.tipos_habitacion?.nombre && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          fontWeight: 700,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h.tipos_habitacion.nombre}
                      </span>
                    )}
                    {bloqueada && (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: 2,
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#5347d1',
                          background: '#a89ae8',
                          padding: '1px 5px',
                          borderRadius: 999,
                        }}
                      >
                        Bloqueada
                      </span>
                    )}
                  </td>
                  {celdasHabitacion(h.id).map((c, i) =>
                    c.tipo === 'simple' ? (
                      <td
                        key={i}
                        colSpan={c.segmento.span}
                        title={
                          c.segmento.ocupado
                            ? c.segmento.huesped
                            : bloqueada
                              ? 'Habitación bloqueada'
                              : 'Crear reserva'
                        }
                        onClick={() => onCellClick(h, c.segmento)}
                        style={{
                          ...tdCalStyle,
                          background: c.segmento.ocupado
                            ? 'var(--brand)'
                            : bloqueada
                              ? 'repeating-linear-gradient(45deg, var(--surface-2), var(--surface-2) 6px, var(--border) 6px, var(--border) 12px)'
                              : 'transparent',
                          color: c.segmento.ocupado ? '#fff' : 'var(--text-muted)',
                          fontWeight: c.segmento.ocupado ? 500 : 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 0,
                          cursor: !c.segmento.ocupado && bloqueada ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {c.segmento.ocupado ? c.segmento.huesped : ''}
                      </td>
                    ) : (
                      <td key={i} style={{ ...tdCalStyle, padding: 0, maxWidth: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', height: '100%', minHeight: 20 }}>
                          <div
                            onClick={() => onCellClick(h, c.saliente)}
                            title={`Sale: ${c.saliente.huesped}`}
                            style={{
                              flex: 1,
                              background: 'var(--brand)',
                              cursor: 'pointer',
                            }}
                          />
                          <div
                            onClick={() => onCellClick(h, c.derecha)}
                            title={c.derecha.ocupado ? `Entra: ${c.derecha.huesped}` : 'Crear reserva (desde el checkout)'}
                            style={{
                              flex: 1,
                              background: c.derecha.ocupado ? 'var(--brand)' : 'transparent',
                              opacity: c.derecha.ocupado ? 0.6 : 1,
                              borderLeft: `1.5px dashed ${CAL_BORDE}`,
                              cursor: 'pointer',
                            }}
                          />
                        </div>
                      </td>
                    ),
                  )}
                </tr>
                );
              })}
              {habitacionesOrdenadas.length === 0 && (
                <tr>
                  <td style={tdCalStyle}>No hay habitaciones.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Panel de solo consulta con la tarifa por noche de cada tipo de
// habitación según el tipo de cliente -- útil para no tener que ir a
// Configuración cada vez que se arma una reserva y hay que decidir/
// verificar el precio a cobrar.
// Modal de solo consulta: al vivir fuera del flujo normal de la página no
// compite por espacio con el filtro Desde/Hasta ni con el calendario (a
// diferencia de la versión anterior, embebida junto a los filtros, que
// terminaba empujando todo hacia abajo). Sin límite de alto, cada tipo de
// habitación vuelve a ir en su propia fila (más fácil de leer que la
// versión compacta por columnas).
function TarifasModal({
  tiposHabitacion,
  onClose,
}: {
  tiposHabitacion: TipoHabitacionPrecios[];
  onClose: () => void;
}) {
  const hayPorHora = tiposHabitacion.some((t) => t.precio_por_hora != null && Number(t.precio_por_hora) > 0);
  const ordenados = [...tiposHabitacion].sort((a, b) => Number(a.precio_normal) - Number(b.precio_normal));
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 480 }}>
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>Tarifas por tipo (S/.)</h2>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th style={{ ...thTarifaStyle, textAlign: 'left' }}>Tipo</th>
              <th style={thTarifaStyle}>Normal</th>
              <th style={thTarifaStyle}>Corp.</th>
              <th style={thTarifaStyle}>Web</th>
              {hayPorHora && <th style={thTarifaStyle}>Hora</th>}
            </tr>
          </thead>
          <tbody>
            {ordenados.map((t) => (
              <tr key={t.id}>
                <td style={{ ...tdTarifaStyle, textAlign: 'left', fontWeight: 500 }}>{t.nombre}</td>
                <td style={tdTarifaStyle}>{Number(t.precio_normal).toFixed(2)}</td>
                <td style={tdTarifaStyle}>{Number(t.precio_corporativo).toFixed(2)}</td>
                <td style={tdTarifaStyle}>{Number(t.precio_web).toFixed(2)}</td>
                {hayPorHora && (
                  <td style={tdTarifaStyle}>
                    {t.precio_por_hora != null ? Number(t.precio_por_hora).toFixed(2) : '—'}
                  </td>
                )}
              </tr>
            ))}
            {ordenados.length === 0 && (
              <tr>
                <td colSpan={hayPorHora ? 5 : 4} style={{ ...tdTarifaStyle, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No hay tipos de habitación configurados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: string }) {
  const colores: Record<string, { bg: string; text: string }> = {
    pendiente_revision: { bg: 'var(--limpieza-bg)', text: 'var(--limpieza-text)' },
    confirmada: { bg: 'var(--disponible-bg)', text: 'var(--disponible-text)' },
    cancelada: { bg: 'var(--ocupada-bg)', text: 'var(--ocupada-text)' },
  };
  const c = colores[estado] ?? { bg: 'var(--surface-1)', text: 'var(--text-secondary)' };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 999,
      }}
    >
      {estado}
    </span>
  );
}

function NuevaReservaForm({
  hotelId,
  habitaciones,
  tiposHabitacion,
  onCreada,
}: {
  hotelId: string;
  habitaciones: Habitacion[];
  tiposHabitacion: TipoHabitacionPrecios[];
  onCreada: () => void;
}) {
  const [dni, setDni] = useState('');
  const [huespedId, setHuespedId] = useState<string | null>(null);
  const [huespedNombre, setHuespedNombre] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [origen, setOrigen] = useState('directo');
  const [habitacionId, setHabitacionId] = useState('');
  const [nroPersonas, setNroPersonas] = useState(2);
  const [tipoAlquiler, setTipoAlquiler] = useState<'pernocte' | 'por_horas'>('pernocte');
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>('normal');
  const [tarifaDia, setTarifaDia] = useState(0);
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function preciosDe(habId: string): TipoHabitacionPrecios | undefined {
    const hab = habitaciones.find((h) => h.id === habId);
    if (!hab?.tipos_habitacion) return undefined;
    return tiposHabitacion.find((t) => t.id === hab.tipos_habitacion!.id);
  }

  function recalcularTarifa(habId: string, tc: TipoCliente, ta: 'pernocte' | 'por_horas') {
    setTarifaDia(precioSegunTipoCliente(preciosDe(habId), tc, ta));
  }

  const precioCosto = Number(preciosDe(habitacionId)?.precio_costo ?? 0);
  const tarifaBajoCosto = precioCosto > 0 && tarifaDia < precioCosto;

  async function buscar() {
    if (!dni) return;
    setBuscando(true);
    setError(null);
    try {
      const h = await buscarHuespedPorDni(hotelId, dni);
      if (h) {
        setHuespedId(h.id);
        setHuespedNombre(`${h.nombres} ${h.apellidos}`);
      } else {
        setHuespedId(null);
        setHuespedNombre('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar huésped');
    } finally {
      setBuscando(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      let idHuesped = huespedId;
      if (!idHuesped) {
        if (!nombres || !apellidos || !dni) {
          throw new Error('Completa nombres, apellidos y DNI para crear al huésped');
        }
        const creado = await crearHuesped(hotelId, { nombres, apellidos, tipoDoc: 'dni', nroDoc: dni });
        idHuesped = creado.id;
      }

      await api.post(`/hoteles/${hotelId}/reservas`, {
        huespedId: idHuesped,
        origen,
        habitaciones: [
          {
            habitacionId,
            nroPersonas,
            tipoAlquiler,
            tipoCliente,
            tarifaDiaManual: tarifaDia,
            checkinPrevisto: new Date(checkin).toISOString(),
            checkoutPrevisto: new Date(checkout).toISOString(),
          },
        ],
      });
      onCreada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva');
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
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={labelStyle}>DNI del huésped</label>
          <input value={dni} onChange={(e) => setDni(e.target.value)} style={inputStyle} required />
        </div>
        <button type="button" onClick={buscar} disabled={buscando} style={btnSecondary}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {huespedId ? (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Huésped encontrado: {huespedNombre}</p>
      ) : (
        dni && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Nombres (huésped nuevo)</label>
              <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Apellidos</label>
              <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={labelStyle}>Origen</label>
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} style={selectStyle}>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={labelStyle}>Habitación</label>
          <select
            value={habitacionId}
            onChange={(e) => {
              setHabitacionId(e.target.value);
              recalcularTarifa(e.target.value, tipoCliente, tipoAlquiler);
            }}
            style={selectStyle}
            required
          >
            <option value="">Selecciona...</option>
            {habitaciones.map((h) => (
              <option key={h.id} value={h.id}>
                {h.hab_numero} · {h.tipos_habitacion?.nombre}
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: 90 }}>
          <label style={labelStyle}># personas</label>
          <input
            type="number"
            min={1}
            value={nroPersonas}
            onChange={(e) => setNroPersonas(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div style={{ width: 130 }}>
          <label style={labelStyle}>Tipo</label>
          <select
            value={tipoAlquiler}
            onChange={(e) => {
              const valor = e.target.value as 'pernocte' | 'por_horas';
              setTipoAlquiler(valor);
              recalcularTarifa(habitacionId, tipoCliente, valor);
            }}
            style={selectStyle}
          >
            <option value="pernocte">Pernocte</option>
            <option value="por_horas">Por horas</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ width: 150 }}>
          <label style={labelStyle}>Tipo de cliente</label>
          <select
            value={tipoCliente}
            onChange={(e) => {
              const valor = e.target.value as TipoCliente;
              setTipoCliente(valor);
              recalcularTarifa(habitacionId, valor, tipoAlquiler);
            }}
            style={selectStyle}
          >
            <option value="normal">Normal</option>
            <option value="corporativo">Corporativo</option>
            <option value="web">Web</option>
          </select>
        </div>
        <div style={{ width: 150 }}>
          <label style={labelStyle}>Tarifa/día (S/.)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={tarifaDia}
            onChange={(e) => setTarifaDia(Number(e.target.value))}
            style={{ ...inputStyle, ...(tarifaBajoCosto ? { borderColor: 'var(--danger)' } : {}) }}
            required
          />
        </div>
        {precioCosto > 0 && (
          <p style={{ fontSize: 11, color: tarifaBajoCosto ? 'var(--danger)' : 'var(--text-muted)', margin: 0 }}>
            Costo: S/. {precioCosto}
            {tarifaBajoCosto ? ' — la tarifa no puede quedar por debajo' : ''}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={labelStyle}>Check-in</label>
          <input type="datetime-local" value={checkin} onChange={(e) => setCheckin(e.target.value)} style={inputStyle} required />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={labelStyle}>Check-out</label>
          <input type="datetime-local" value={checkout} onChange={(e) => setCheckout(e.target.value)} style={inputStyle} required />
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      <button type="submit" disabled={enviando || tarifaBajoCosto} style={btnPrimary}>
        {enviando ? 'Creando...' : 'Crear reserva'}
      </button>
    </form>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const selectStyle: CSSProperties = { ...inputStyle };

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

const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const btnToggle: CSSProperties = {
  padding: '6px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  color: 'var(--text-secondary)',
};

const btnToggleActivo: CSSProperties = {
  ...btnToggle,
  background: 'var(--brand)',
  color: '#fff',
  borderColor: 'var(--brand)',
};

// Grilla del calendario: líneas más oscuras y gruesas que el resto de la
// app (a propósito, para que se lea como un calendario "de verdad" y no
// como una tabla más) y una banda de encabezado con color, distinta para
// el mes, los días de semana y el fin de semana.
const CAL_BORDE = '#9a978c';
const CAL_HEADER_DIA = '#2f5fa8';

const thCalStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: `2px solid ${CAL_BORDE}`,
  borderRight: `1.5px solid ${CAL_BORDE}`,
  textAlign: 'center',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const tdCalStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: `1.5px solid ${CAL_BORDE}`,
  borderRight: `1.5px solid ${CAL_BORDE}`,
  textAlign: 'center',
  fontSize: 11,
};

const thTarifaStyle: CSSProperties = {
  padding: '4px 10px 6px',
  textAlign: 'right',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

const tdTarifaStyle: CSSProperties = {
  padding: '4px 10px',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 16px',
  overflowY: 'auto',
  zIndex: 100,
};

const modalStyle: CSSProperties = {
  background: 'var(--surface-0, var(--surface-1))',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 24,
  width: '100%',
};
