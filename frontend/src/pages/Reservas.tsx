import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { buscarHuespedPorDni, crearHuesped } from '../lib/huespedes';
import { ReservaFormModal } from '../components/ReservaFormModal';

interface Habitacion {
  id: string;
  hab_numero: number;
  tipos_habitacion: { id: string; nombre: string; aforo_max?: number } | null;
}

interface TipoHabitacionPrecios {
  id: string;
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
  const [desde, setDesde] = useState(() => hoyYMD());
  const [hasta, setHasta] = useState(() => sumarDias(hoyYMD(), 10));
  const [calendario, setCalendario] = useState<ReservaCalendario[]>([]);
  const [calendarioLoading, setCalendarioLoading] = useState(false);
  const [calendarioError, setCalendarioError] = useState<string | null>(null);
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

      {vista === 'calendario' && (
        <CalendarioReservas
          habitaciones={habitaciones}
          calendario={calendario}
          loading={calendarioLoading}
          error={calendarioError}
          desde={desde}
          hasta={hasta}
          onDesdeChange={setDesde}
          onHastaChange={setHasta}
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

function CalendarioReservas({
  habitaciones,
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

  function segmentosHabitacion(habId: string): SegmentoCelda[] {
    const items = calendario.filter((c) => c.habitacionId === habId);
    const estadoDias = dias.map((d) => {
      const ymd = fechaYMD(d);
      const match = items.find(
        (it) => ymd >= fechaYMD(new Date(it.checkinPrevisto)) && ymd <= fechaYMD(new Date(it.checkoutPrevisto)),
      );
      return match
        ? {
            ocupado: true as const,
            key: match.id,
            huesped: match.huesped,
            reservaId: match.reservaId,
            lineaId: match.id,
            estadiaId: match.estadiaId,
            estadoEstadia: match.estadoEstadia,
            fechaInicio: ymd,
          }
        : {
            ocupado: false as const,
            key: null as string | null,
            huesped: '',
            reservaId: null,
            lineaId: null,
            estadiaId: null,
            estadoEstadia: null,
            fechaInicio: ymd,
          };
    });

    // Solo se fusionan días OCUPADOS consecutivos de la misma reserva (para
    // pintar la barra tipo Gantt). Los días vacíos nunca se fusionan entre
    // sí -- cada uno queda como su propia celda clickeable, para que el
    // click abra el formulario con la fecha exacta que se tocó (si se
    // fusionaran, el click siempre tomaría el primer día del bloque en vez
    // del día bajo el cursor).
    const segmentos: SegmentoCelda[] = [];
    for (const e of estadoDias) {
      const ultimo = segmentos[segmentos.length - 1];
      if (ultimo && ultimo.ocupado && e.ocupado && ultimo.key === e.key) {
        ultimo.span += 1;
      } else {
        segmentos.push({ span: 1, ...e });
      }
    }
    return segmentos;
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Desde</label>
          <input type="date" value={desde} onChange={(e) => onDesdeChange(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => onHastaChange(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
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
                    background: 'var(--surface-2)',
                    width: 108,
                    maxWidth: 108,
                    padding: '6px 6px',
                    textAlign: 'left',
                  }}
                >
                  Habitación
                </th>
                {gruposMes.map((g, i) => (
                  <th key={i} colSpan={g.span} style={thCalStyle}>
                    {g.etiqueta}
                  </th>
                ))}
              </tr>
              <tr>
                {dias.map((d, i) => (
                  <th key={i} style={{ ...thCalStyle, minWidth: 34 }}>
                    {d.getDate()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {habitacionesOrdenadas.map((h) => (
                <tr key={h.id}>
                  <td
                    title={`${h.hab_numero} · ${h.tipos_habitacion?.nombre ?? ''}`}
                    style={{
                      ...tdCalStyle,
                      position: 'sticky',
                      left: 0,
                      background: 'var(--surface-1)',
                      textAlign: 'left',
                      width: 108,
                      maxWidth: 108,
                      padding: '6px 6px',
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{h.hab_numero}</span>
                    {h.tipos_habitacion?.nombre && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          fontWeight: 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h.tipos_habitacion.nombre}
                      </span>
                    )}
                  </td>
                  {segmentosHabitacion(h.id).map((s, i) => (
                    <td
                      key={i}
                      colSpan={s.span}
                      title={s.ocupado ? s.huesped : 'Crear reserva'}
                      onClick={() => onCellClick(h, s)}
                      style={{
                        ...tdCalStyle,
                        background: s.ocupado ? 'var(--brand)' : 'transparent',
                        color: s.ocupado ? '#fff' : 'var(--text-muted)',
                        fontWeight: s.ocupado ? 500 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 0,
                        cursor: 'pointer',
                      }}
                    >
                      {s.ocupado ? s.huesped : ''}
                    </td>
                  ))}
                </tr>
              ))}
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

const thCalStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)',
  textAlign: 'center',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
};

const tdCalStyle: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--border)',
  borderRight: '1px solid var(--border)',
  textAlign: 'center',
  fontSize: 11,
};
