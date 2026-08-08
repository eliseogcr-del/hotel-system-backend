import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface TipoHabitacion {
  id: string;
  nombre: string;
  aforo_max: number;
  tiempo_limpieza_min: number;
  activo: boolean;
}

interface Tarifa {
  id: string;
  minimo: number | null;
  normal: number;
  booking: number | null;
  airbnb: number | null;
  vigente_desde: string;
  tipos_habitacion: { nombre: string } | null;
}

interface Cochera {
  id: string;
  numero: string;
  tamano: string;
  estado: string;
  es_externa: boolean;
  precio_externa: number;
}

export function Configuracion() {
  const { hotelActual } = useHotel();
  const [tipos, setTipos] = useState<TipoHabitacion[]>([]);
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [cocheras, setCocheras] = useState<Cochera[]>([]);
  const [error, setError] = useState<string | null>(null);

  function cargarTodo() {
    if (!hotelActual) return;
    const h = hotelActual.hotelId;
    api.get<TipoHabitacion[]>(`/hoteles/${h}/tipos-habitacion`).then(setTipos).catch(() => {});
    api.get<Tarifa[]>(`/hoteles/${h}/tarifas`).then(setTarifas).catch(() => {});
    api.get<Cochera[]>(`/hoteles/${h}/cocheras`).then(setCocheras).catch(() => {});
  }

  useEffect(cargarTodo, [hotelActual]);

  if (!hotelActual) return null;

  if (hotelActual.rol !== 'admin') {
    return <p style={{ color: 'var(--text-muted)' }}>Solo un administrador puede ver esta sección.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <h1 style={{ fontSize: 20 }}>Configuración</h1>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <SeccionTipos hotelId={hotelActual.hotelId} tipos={tipos} onCambio={cargarTodo} setError={setError} />
      <SeccionHabitaciones hotelId={hotelActual.hotelId} tipos={tipos} setError={setError} />
      <SeccionTarifas hotelId={hotelActual.hotelId} tipos={tipos} tarifas={tarifas} onCambio={cargarTodo} setError={setError} />
      <SeccionCocheras hotelId={hotelActual.hotelId} cocheras={cocheras} onCambio={cargarTodo} setError={setError} />
    </div>
  );
}

function SeccionTipos({
  hotelId,
  tipos,
  onCambio,
  setError,
}: {
  hotelId: string;
  tipos: TipoHabitacion[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [aforoMax, setAforoMax] = useState(2);
  const [tiempoLimpiezaMin, setTiempoLimpiezaMin] = useState(45);
  const [enviando, setEnviando] = useState(false);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tipos-habitacion`, { nombre, aforoMax, tiempoLimpiezaMin });
      setNombre('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el tipo');
    } finally {
      setEnviando(false);
    }
  }

  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function alternarActivo(tipo: TipoHabitacion) {
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/tipos-habitacion/${tipo.id}`, { activo: !tipo.activo });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Tipos de habitación</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {tipos.map((t) =>
          editandoId === t.id ? (
            <EditarTipoForm
              key={t.id}
              hotelId={hotelId}
              tipo={t}
              onGuardado={() => {
                setEditandoId(null);
                onCambio();
              }}
              onCancelar={() => setEditandoId(null)}
              setError={setError}
            />
          ) : (
            <div key={t.id} style={filaStyle}>
              <span>{t.nombre}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Aforo {t.aforo_max}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Limpieza {t.tiempo_limpieza_min} min</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditandoId(t.id)} style={btnSecondary}>
                  Editar
                </button>
                <button onClick={() => alternarActivo(t)} style={btnSecondary}>
                  {t.activo ? 'Desactivar' : 'Activar'}
                </button>
              </span>
            </div>
          ),
        )}
        {tipos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay tipos creados.</p>}
      </div>
      <form onSubmit={crear} style={formInlineStyle}>
        <input placeholder="Nombre (ej. Suite)" value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} required />
        <input
          type="number"
          min={1}
          value={aforoMax}
          onChange={(e) => setAforoMax(Number(e.target.value))}
          style={{ ...inputStyle, width: 90 }}
          title="Aforo máximo"
        />
        <input
          type="number"
          min={1}
          value={tiempoLimpiezaMin}
          onChange={(e) => setTiempoLimpiezaMin(Number(e.target.value))}
          style={{ ...inputStyle, width: 110 }}
          title="Minutos de limpieza"
        />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Agregar tipo
        </button>
      </form>
    </section>
  );
}

function EditarTipoForm({
  hotelId,
  tipo,
  onGuardado,
  onCancelar,
  setError,
}: {
  hotelId: string;
  tipo: TipoHabitacion;
  onGuardado: () => void;
  onCancelar: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState(tipo.nombre);
  const [aforoMax, setAforoMax] = useState(tipo.aforo_max);
  const [tiempoLimpiezaMin, setTiempoLimpiezaMin] = useState(tipo.tiempo_limpieza_min);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/tipos-habitacion/${tipo.id}`, {
        nombre,
        aforoMax,
        tiempoLimpiezaMin,
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ ...filaStyle, justifyContent: 'flex-start', gap: 8 }}>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
      <input
        type="number"
        min={1}
        value={aforoMax}
        onChange={(e) => setAforoMax(Number(e.target.value))}
        style={{ ...inputStyle, width: 90 }}
        title="Aforo máximo"
      />
      <input
        type="number"
        min={1}
        value={tiempoLimpiezaMin}
        onChange={(e) => setTiempoLimpiezaMin(Number(e.target.value))}
        style={{ ...inputStyle, width: 110 }}
        title="Minutos de limpieza"
      />
      <button type="submit" disabled={guardando} style={btnPrimary}>
        Guardar
      </button>
      <button type="button" onClick={onCancelar} style={btnSecondary}>
        Cancelar
      </button>
    </form>
  );
}

function SeccionHabitaciones({
  hotelId,
  tipos,
  setError,
}: {
  hotelId: string;
  tipos: TipoHabitacion[];
  setError: (e: string | null) => void;
}) {
  const [habNumero, setHabNumero] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [piso, setPiso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      const creada = await api.post<{ hab_numero: number }>(`/hoteles/${hotelId}/habitaciones`, {
        habNumero: Number(habNumero),
        tipoId,
        piso,
      });
      setOk(`Habitación ${creada.hab_numero} creada.`);
      setHabNumero('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la habitación');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Agregar habitación</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Para ver/editar las habitaciones existentes, ve a la pantalla de Habitaciones.
      </p>
      {ok && <p style={{ fontSize: 12, color: 'var(--disponible)', marginBottom: 8 }}>{ok}</p>}
      <form onSubmit={crear} style={formInlineStyle}>
        <input
          type="number"
          min={1}
          placeholder="N° habitación"
          value={habNumero}
          onChange={(e) => setHabNumero(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
          required
        />
        <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} style={inputStyle} required>
          <option value="">Tipo...</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={piso}
          onChange={(e) => setPiso(Number(e.target.value))}
          style={{ ...inputStyle, width: 90 }}
          title="Piso"
        />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Agregar habitación
        </button>
      </form>
    </section>
  );
}

function SeccionTarifas({
  hotelId,
  tipos,
  tarifas,
  onCambio,
  setError,
}: {
  hotelId: string;
  tipos: TipoHabitacion[];
  tarifas: Tarifa[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [tipoHabId, setTipoHabId] = useState('');
  const [normal, setNormal] = useState('');
  const [minimo, setMinimo] = useState('');
  const [booking, setBooking] = useState('');
  const [airbnb, setAirbnb] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tarifas`, {
        tipoHabId,
        normal: Number(normal),
        minimo: minimo ? Number(minimo) : undefined,
        booking: booking ? Number(booking) : undefined,
        airbnb: airbnb ? Number(airbnb) : undefined,
      });
      setNormal('');
      setMinimo('');
      setBooking('');
      setAirbnb('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la tarifa');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Tarifas</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Cada tarifa nueva rige desde hoy; las anteriores quedan como historial (no se borran).
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {tarifas.map((t) => (
          <div key={t.id} style={filaStyle}>
            <span>{t.tipos_habitacion?.nombre}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Normal: {t.normal}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Mín/hora: {t.minimo ?? '—'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Booking: {t.booking ?? '—'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Airbnb: {t.airbnb ?? '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>desde {t.vigente_desde}</span>
          </div>
        ))}
        {tarifas.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay tarifas creadas.</p>}
      </div>
      <form onSubmit={crear} style={formInlineStyle}>
        <select value={tipoHabId} onChange={(e) => setTipoHabId(e.target.value)} style={inputStyle} required>
          <option value="">Tipo...</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <input type="number" min={0} step={0.01} placeholder="Normal" value={normal} onChange={(e) => setNormal(e.target.value)} style={{ ...inputStyle, width: 100 }} required />
        <input type="number" min={0} step={0.01} placeholder="Mín/hora" value={minimo} onChange={(e) => setMinimo(e.target.value)} style={{ ...inputStyle, width: 100 }} />
        <input type="number" min={0} step={0.01} placeholder="Booking" value={booking} onChange={(e) => setBooking(e.target.value)} style={{ ...inputStyle, width: 100 }} />
        <input type="number" min={0} step={0.01} placeholder="Airbnb" value={airbnb} onChange={(e) => setAirbnb(e.target.value)} style={{ ...inputStyle, width: 100 }} />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Agregar tarifa
        </button>
      </form>
    </section>
  );
}

function SeccionCocheras({
  hotelId,
  cocheras,
  onCambio,
  setError,
}: {
  hotelId: string;
  cocheras: Cochera[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [numero, setNumero] = useState('');
  const [tamano, setTamano] = useState<'grande' | 'chica'>('chica');
  const [enviando, setEnviando] = useState(false);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/cocheras`, { numero, tamano });
      setNumero('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la cochera');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Cocheras</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {cocheras.map((c) => (
          <div key={c.id} style={filaStyle}>
            <span>{c.numero}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{c.tamano}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.estado}</span>
          </div>
        ))}
        {cocheras.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay cocheras creadas.</p>}
      </div>
      <form onSubmit={crear} style={formInlineStyle}>
        <input placeholder="Número (ej. C1)" value={numero} onChange={(e) => setNumero(e.target.value)} style={inputStyle} required />
        <select value={tamano} onChange={(e) => setTamano(e.target.value as 'grande' | 'chica')} style={inputStyle}>
          <option value="chica">Chica</option>
          <option value="grande">Grande</option>
        </select>
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Agregar cochera
        </button>
      </form>
    </section>
  );
}

const filaStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'var(--surface-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const formInlineStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  alignItems: 'center',
};

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
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
