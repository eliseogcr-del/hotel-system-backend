import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface Habitacion {
  id: string;
  hab_numero: number;
}

interface TareaHk {
  id: string;
  tipo: 'limpieza' | 'mantenimiento';
  estado: 'planificado' | 'en_proceso' | 'terminado';
  prioridad: number;
  con_huesped_dentro: boolean;
  habitaciones: { hab_numero: number; piso: number } | null;
}

const ESTADOS = ['planificado', 'en_proceso', 'terminado'];

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
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [accionando, setAccionando] = useState<string | null>(null);

  function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    const query = filtroEstado ? `?estado=${filtroEstado}` : '';
    api
      .get<TareaHk[]>(`/hoteles/${hotelActual.hotelId}/tareas-hk${query}`)
      .then(setTareas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, [hotelActual, filtroEstado]);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch(() => {});
  }, [hotelActual]);

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

  if (!hotelActual) return null;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Tareas HK</h1>
        <button style={btnPrimary} onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Nueva tarea'}
        </button>
      </div>

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

      <select
        value={filtroEstado}
        onChange={(e) => setFiltroEstado(e.target.value)}
        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, margin: '16px 0' }}
      >
        <option value="">Todos los estados</option>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {ESTADO_LABEL[e]}
          </option>
        ))}
      </select>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tareas.map((t) => (
            <div
              key={t.id}
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
                fontSize: 13,
              }}
            >
              <span>
                Habitación {t.habitaciones?.hab_numero} · {TIPO_LABEL[t.tipo] ?? t.tipo}
                {t.con_huesped_dentro && (
                  <span style={{ color: 'var(--text-muted)' }}> (con huésped dentro)</span>
                )}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>Prioridad {t.prioridad}</span>
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
          ))}
          {tareas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay tareas.</p>}
        </div>
      )}
    </div>
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tareas-hk`, { habitacionId, tipo, conHuespedDentro });
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={conHuespedDentro} onChange={(e) => setConHuespedDentro(e.target.checked)} />
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
