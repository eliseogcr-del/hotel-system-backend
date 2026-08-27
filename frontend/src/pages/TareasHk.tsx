import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

type EstadoHabitacion = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' | 'bloqueada';

interface Habitacion {
  id: string;
  hab_numero: number;
  estado?: EstadoHabitacion;
  huesped?: string | null;
  reservaHoy?: { huesped: string | null } | null;
}

interface Cochera {
  id: string;
  numero: string;
  estado: 'disponible' | 'ocupada';
  ocupante: { habNumero: number | null; huesped: string | null } | null;
}

type Vista = 'tareas' | 'habitaciones';

// Mismos colores intensos que usa el dashboard de Habitaciones (ver
// Habitaciones.tsx) -- se duplican acá porque esta es una vista de solo
// lectura, sin ninguna de las acciones/columnas de esa pantalla, pensada
// para que HK tenga visibilidad rápida sin exponerle datos financieros ni
// operativos que no le corresponden.
const ESTADO_HAB_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  disponible: { bg: '#8fca55', border: '#4c7a19', text: '#173404' },
  ocupada: { bg: '#ef7371', border: '#c8302f', text: '#501313' },
  limpieza: { bg: '#f7c94a', border: '#c97e0a', text: '#412402' },
  mantenimiento: { bg: '#f2954a', border: '#cc5f00', text: '#4a2000' },
  bloqueada: { bg: '#a89ae8', border: '#5347d1', text: '#26215c' },
  reservada: { bg: '#5cbde0', border: '#0f7fa8', text: '#0b3a4a' },
};

const ESTADO_HAB_LABEL: Record<EstadoHabitacion, string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
  limpieza: 'Limpieza',
  mantenimiento: 'Mantenimiento',
  bloqueada: 'Bloqueada',
};

interface TareaHk {
  id: string;
  tipo: 'limpieza' | 'mantenimiento';
  estado: 'planificado' | 'en_proceso' | 'terminado';
  prioridad: number;
  con_huesped_dentro: boolean;
  notas: string | null;
  habitaciones: { hab_numero: number; piso: number } | null;
}

const ESTADOS = ['planificado', 'en_proceso', 'terminado'];

// Perú (America/Lima) es UTC-5 todo el año -- mismo criterio que el resto
// del sistema (ver Reportes.tsx) para que "hoy" no dependa de la zona
// horaria del navegador.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function fechaHoy(): string {
  return new Date(Date.now() - PERU_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

const ESTADO_LABEL: Record<string, string> = {
  planificado: 'Planificado',
  en_proceso: 'En proceso',
  terminado: 'Terminado',
};

const TIPO_LABEL: Record<string, string> = {
  limpieza: 'Limpieza',
  mantenimiento: 'Mantenimiento',
};

export function TareasHk() {
  const { hotelActual } = useHotel();
  const [tareas, setTareas] = useState<TareaHk[]>([]);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [cocheras, setCocheras] = useState<Cochera[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroFecha, setFiltroFecha] = useState(fechaHoy());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [accionando, setAccionando] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('tareas');

  function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filtroEstado) params.set('estado', filtroEstado);
    if (filtroFecha) params.set('fecha', filtroFecha);
    const query = params.toString() ? `?${params.toString()}` : '';
    api
      .get<TareaHk[]>(`/hoteles/${hotelActual.hotelId}/tareas-hk${query}`)
      .then(setTareas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, [hotelActual, filtroEstado, filtroFecha]);

  function cargarHabitacionesCocheras() {
    if (!hotelActual) return;
    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch(() => {});
    api
      .get<Cochera[]>(`/hoteles/${hotelActual.hotelId}/cocheras`)
      .then(setCocheras)
      .catch(() => {});
  }

  useEffect(cargarHabitacionesCocheras, [hotelActual]);

  async function iniciar(tareaId: string) {
    if (!hotelActual) return;
    setAccionando(tareaId);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/tareas-hk/${tareaId}/iniciar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar');
    } finally {
      setAccionando(null);
    }
  }

  async function terminar(tareaId: string) {
    if (!hotelActual) return;
    setAccionando(tareaId);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/tareas-hk/${tareaId}/terminar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo terminar');
    } finally {
      setAccionando(null);
    }
  }

  // Se refleja en la columna Notas de Habitaciones mientras la habitación
  // no tiene huésped activo (ver HabitacionesService.listarConEstado()),
  // para que recepción la vea sin entrar a Tareas HK.
  async function guardarNotas(tareaId: string, notas: string) {
    if (!hotelActual) return;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/tareas-hk/${tareaId}/notas`, { notas });
      setTareas((prev) => prev.map((t) => (t.id === tareaId ? { ...t, notas: notas || null } : t)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar las notas');
    }
  }

  if (!hotelActual) return null;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Tareas HK</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Oculto por el momento: las tareas las asigna recepción, no se
              crean a mano desde acá -- ver mostrarForm/NuevaTareaForm más
              abajo si hay que reactivarlo. */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <button
              onClick={() => setVista('tareas')}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                border: 'none',
                cursor: 'pointer',
                background: vista === 'tareas' ? 'var(--brand)' : 'var(--surface-1)',
                color: vista === 'tareas' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Tareas HK
            </button>
            <button
              onClick={() => {
                setVista('habitaciones');
                cargarHabitacionesCocheras();
              }}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                border: 'none',
                cursor: 'pointer',
                background: vista === 'habitaciones' ? 'var(--brand)' : 'var(--surface-1)',
                color: vista === 'habitaciones' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Habitaciones
            </button>
          </div>
        </div>
      </div>

      {vista === 'habitaciones' && (
        <VistaHabitacionesSoloLectura habitaciones={habitaciones} cocheras={cocheras} />
      )}

      {vista === 'tareas' && (
        <>
      {mostrarForm && (
        <NuevaTareaForm
          hotelId={hotelActual.hotelId}
          habitaciones={habitaciones}
          onCreada={() => {
            setMostrarForm(false);
            cargar();
          }}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', margin: '16px 0' }}>
        <div>
          <label style={labelStyle}>Fecha</label>
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            style={inputStyle}
          />
        </div>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e]}
            </option>
          ))}
        </select>
        {filtroFecha !== fechaHoy() && (
          <button type="button" onClick={() => setFiltroFecha(fechaHoy())} style={btnSecondary}>
            Hoy
          </button>
        )}
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tareas.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 14px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '4px 12px' }}>
                <span>
                  Habitación {t.habitaciones?.hab_numero} · {TIPO_LABEL[t.tipo] ?? t.tipo}
                  {t.con_huesped_dentro && (
                    <span style={{ color: 'var(--text-muted)' }}> (con huésped dentro)</span>
                  )}
                </span>
                {/* Prioridad oculta por el momento (no se usa todavía) --
                    ver t.prioridad si hay que reactivarla. */}
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    color: t.estado === 'terminado' ? 'var(--disponible-text)' : 'var(--text-secondary)',
                  }}
                >
                  {ESTADO_LABEL[t.estado] ?? t.estado}
                </span>
                <span>
                  {t.estado === 'planificado' && (
                    <button onClick={() => iniciar(t.id)} disabled={accionando === t.id} style={btnSecondary}>
                      Iniciar
                    </button>
                  )}
                  {t.estado === 'en_proceso' && (
                    <button onClick={() => terminar(t.id)} disabled={accionando === t.id} style={btnSecondary}>
                      Terminar
                    </button>
                  )}
                </span>
              </div>
              <NotasTareaCelda notas={t.notas ?? ''} onGuardar={(n) => guardarNotas(t.id, n)} />
            </div>
          ))}
          {tareas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay tareas.</p>}
        </div>
      )}
        </>
      )}
    </div>
  );
}

// Vista de solo lectura para que HK tenga visibilidad de qué habitaciones
// están libres/ocupadas/bloqueadas sin exponerle datos financieros ni
// operativos (saldo, tarifa, notas, etc.) que no le corresponden -- solo
// número, estado (color) y nombre del huésped si la hay.
function VistaHabitacionesSoloLectura({
  habitaciones,
  cocheras,
}: {
  habitaciones: Habitacion[];
  cocheras: Cochera[];
}) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {(Object.keys(ESTADO_HAB_LABEL) as EstadoHabitacion[]).map((estado) => (
          <span key={estado} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ESTADO_HAB_COLOR[estado].border,
                display: 'inline-block',
              }}
            />
            {ESTADO_HAB_LABEL[estado]}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: ESTADO_HAB_COLOR.reservada.border,
              display: 'inline-block',
            }}
          />
          Reservada
        </span>
      </div>

      <div style={tarjetasGridStyle}>
        {habitaciones.map((h) => {
          const color = h.reservaHoy ? 'reservada' : (h.estado ?? 'disponible');
          const etiqueta = h.reservaHoy ? 'Reservada' : ESTADO_HAB_LABEL[h.estado ?? 'disponible'];
          const nombre = h.huesped ?? h.reservaHoy?.huesped ?? null;
          return (
            <div
              key={h.id}
              style={{
                ...tarjetaHabStyle,
                background: ESTADO_HAB_COLOR[color].bg,
                border: `2px solid ${ESTADO_HAB_COLOR[color].border}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{h.hab_numero}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_HAB_COLOR[color].text }}>{etiqueta}</span>
              </div>
              {nombre && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={nombre}
                >
                  {nombre}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {habitaciones.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay habitaciones registradas.</p>}

      {cocheras.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Cocheras</h2>
          <div style={tarjetasGridStyle}>
            {cocheras.map((c) => (
              <div
                key={c.id}
                style={{
                  ...tarjetaHabStyle,
                  background: ESTADO_HAB_COLOR[c.estado].bg,
                  border: `2px solid ${ESTADO_HAB_COLOR[c.estado].border}`,
                  minHeight: 64,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{c.numero}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_HAB_COLOR[c.estado].text }}>
                    {c.estado === 'disponible' ? 'Disponible' : 'Ocupada'}
                  </span>
                </div>
                {c.ocupante?.huesped && (
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={c.ocupante.huesped}
                  >
                    {c.ocupante.huesped}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Mismo patrón "clic para editar, guarda al perder foco" que NotasCelda en
// Habitaciones.tsx -- se duplica acá a propósito (archivos distintos, poco
// código) en vez de compartir un componente.
function NotasTareaCelda({ notas, onGuardar }: { notas: string; onGuardar: (valor: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(notas);

  useEffect(() => setValor(notas), [notas]);

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          fontSize: 12.5,
          fontWeight: notas ? 700 : undefined,
          color: notas ? 'var(--nota-texto)' : 'var(--text-muted)',
          cursor: 'pointer',
        }}
        title={notas || 'Agregar nota'}
      >
        {notas || '+ nota'}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => {
        setEditando(false);
        if (valor !== notas) onGuardar(valor);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValor(notas);
          setEditando(false);
        }
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '4px 8px',
        border: '1px solid var(--border-strong)',
        borderRadius: 4,
        fontSize: 12.5,
      }}
    />
  );
}

function NuevaTareaForm({
  hotelId,
  habitaciones,
  onCreada,
}: {
  hotelId: string;
  habitaciones: Habitacion[];
  onCreada: () => void;
}) {
  const [habitacionId, setHabitacionId] = useState('');
  const [tipo, setTipo] = useState<'limpieza' | 'mantenimiento'>('limpieza');
  const [conHuespedDentro, setConHuespedDentro] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const habitacionSeleccionada = habitaciones.find((h) => h.id === habitacionId);
  // "Con huésped dentro" hace que, al terminar la tarea, la habitación se
  // quede 'ocupada' en vez de pasar a 'disponible' -- solo tiene sentido si
  // de verdad hay un huésped ahí. El backend ya lo rechaza igual, esto es
  // para que ni se pueda marcar por error desde acá (bug real que dejó la
  // habitación 202 atascada en 'ocupada' sin huésped).
  const puedeConHuesped = habitacionSeleccionada?.estado === 'ocupada';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tareas-hk`, {
        habitacionId,
        tipo,
        conHuespedDentro: puedeConHuesped && conHuespedDentro,
      });
      onCreada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea');
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
      <div style={{ width: 140 }}>
        <label style={labelStyle}>Habitación</label>
        <select value={habitacionId} onChange={(e) => setHabitacionId(e.target.value)} style={inputStyle} required>
          <option value="">Selecciona...</option>
          {habitaciones.map((h) => (
            <option key={h.id} value={h.id}>
              {h.hab_numero}
            </option>
          ))}
        </select>
      </div>
      <div style={{ width: 160 }}>
        <label style={labelStyle}>Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as 'limpieza' | 'mantenimiento')} style={inputStyle}>
          <option value="limpieza">Limpieza</option>
          <option value="mantenimiento">Mantenimiento</option>
        </select>
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          opacity: puedeConHuesped ? 1 : 0.5,
        }}
        title={puedeConHuesped ? undefined : 'Solo se puede marcar si la habitación está ocupada'}
      >
        <input
          type="checkbox"
          checked={puedeConHuesped && conHuespedDentro}
          disabled={!puedeConHuesped}
          onChange={(e) => setConHuespedDentro(e.target.checked)}
        />
        Con huésped dentro
      </label>
      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Creando...' : 'Crear tarea'}
      </button>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, width: '100%' }}>{error}</p>}
    </form>
  );
}

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
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

const btnSecondary: CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
};

const tarjetasGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: 10,
};

const tarjetaHabStyle: CSSProperties = {
  borderRadius: 12,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: 60,
};
