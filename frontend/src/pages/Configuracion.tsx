import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface TipoHabitacion {
  id: string;
  nombre: string;
  aforo_max: number;
  tiempo_limpieza_min: number;
  activo: boolean;
  precio_normal: number;
  precio_corporativo: number;
  precio_web: number;
  precio_por_hora: number | null;
  precio_costo: number;
}

interface Habitacion {
  id: string;
  hab_numero: number;
  piso: number;
  estado: string;
  tipos_habitacion: { id: string; nombre: string } | null;
}

interface Cochera {
  id: string;
  numero: string;
  tamano: string;
  estado: string;
  es_externa: boolean;
  precio_externa: number;
}

interface ProductoBazar {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean;
}

interface TipoDesayuno {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean;
}

interface Turno {
  id: string;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
}

interface RegistroTipoCambio {
  fecha: string;
  valor_compra: number;
  valor_venta: number;
}

interface HotelConfig {
  id: string;
  nombre: string;
  hora_checkin: string;
  hora_checkout: string;
  modo_24h: boolean;
  precio_mascota: number;
}

type RolHotel = 'admin' | 'recepcion' | 'hk';

interface PersonalHotel {
  id: string;
  rol: RolHotel;
  activo: boolean;
  personal: { id: string; nombre: string; usuario: string; activo: boolean } | null;
}

const ROL_LABEL: Record<RolHotel, string> = {
  admin: 'Administrador',
  recepcion: 'Recepcionista',
  hk: 'Housekeeping (HK)',
};

export function Configuracion() {
  const { hotelActual } = useHotel();
  const [tipos, setTipos] = useState<TipoHabitacion[]>([]);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [cocheras, setCocheras] = useState<Cochera[]>([]);
  const [productosBazar, setProductosBazar] = useState<ProductoBazar[]>([]);
  const [tiposDesayuno, setTiposDesayuno] = useState<TipoDesayuno[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [tiposCambio, setTiposCambio] = useState<RegistroTipoCambio[]>([]);
  const [personal, setPersonal] = useState<PersonalHotel[]>([]);
  const [hotel, setHotel] = useState<HotelConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargarTodo() {
    if (!hotelActual) return;
    const h = hotelActual.hotelId;
    const reportarError = (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'No se pudo cargar la configuración');
    };
    api.get<TipoHabitacion[]>(`/hoteles/${h}/tipos-habitacion`).then(setTipos).catch(reportarError);
    api.get<Habitacion[]>(`/hoteles/${h}/habitaciones`).then(setHabitaciones).catch(reportarError);
    api.get<Cochera[]>(`/hoteles/${h}/cocheras`).then(setCocheras).catch(reportarError);
    api.get<ProductoBazar[]>(`/hoteles/${h}/productos-bazar`).then(setProductosBazar).catch(reportarError);
    api.get<TipoDesayuno[]>(`/hoteles/${h}/tipos-desayuno`).then(setTiposDesayuno).catch(reportarError);
    api.get<Turno[]>(`/hoteles/${h}/turnos`).then(setTurnos).catch(reportarError);
    api.get<RegistroTipoCambio[]>(`/hoteles/${h}/tipo-cambio`).then(setTiposCambio).catch(reportarError);
    api.get<PersonalHotel[]>(`/hoteles/${h}/personal`).then(setPersonal).catch(reportarError);
    api.get<HotelConfig>(`/hoteles/${h}`).then(setHotel).catch(reportarError);
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

      {hotel && <SeccionHotel hotelId={hotelActual.hotelId} hotel={hotel} onCambio={cargarTodo} setError={setError} />}
      <SeccionPersonal hotelId={hotelActual.hotelId} personal={personal} onCambio={cargarTodo} setError={setError} />
      <SeccionTipos hotelId={hotelActual.hotelId} tipos={tipos} onCambio={cargarTodo} setError={setError} />
      <SeccionHabitaciones
        hotelId={hotelActual.hotelId}
        tipos={tipos}
        habitaciones={habitaciones}
        onCambio={cargarTodo}
        setError={setError}
      />
      <SeccionCocheras hotelId={hotelActual.hotelId} cocheras={cocheras} onCambio={cargarTodo} setError={setError} />
      <SeccionBazar hotelId={hotelActual.hotelId} productos={productosBazar} onCambio={cargarTodo} setError={setError} />
      <SeccionTiposDesayuno hotelId={hotelActual.hotelId} tipos={tiposDesayuno} onCambio={cargarTodo} setError={setError} />
      <SeccionTurnos hotelId={hotelActual.hotelId} turnos={turnos} onCambio={cargarTodo} setError={setError} />
      <SeccionTipoCambio hotelId={hotelActual.hotelId} registros={tiposCambio} onCambio={cargarTodo} setError={setError} />
    </div>
  );
}

function SeccionHotel({
  hotelId,
  hotel,
  onCambio,
  setError,
}: {
  hotelId: string;
  hotel: HotelConfig;
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [horaCheckin, setHoraCheckin] = useState(hotel.hora_checkin.slice(0, 5));
  const [horaCheckout, setHoraCheckout] = useState(hotel.hora_checkout.slice(0, 5));
  const [modo24h, setModo24h] = useState(hotel.modo_24h);
  const [precioMascota, setPrecioMascota] = useState(hotel.precio_mascota);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}`, {
        horaCheckin,
        horaCheckout,
        modo24h,
        precioMascota,
      });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la configuración del hotel');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Horario de check-in / check-out</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Define la hora oficial de entrada y salida del hotel. Si el huésped ingresa antes de la hora de
        check-in o sale después de la hora de check-out, el sistema calcula automáticamente un cargo de
        early/late (50% de la tarifa diaria), editable por recepción. Modo 24h desactiva estas horas fijas:
        la salida programada se calcula como check-in + días, a la misma hora de ingreso.
      </p>
      <form onSubmit={guardar} style={formInlineStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Check-in
          <input
            type="time"
            value={horaCheckin}
            onChange={(e) => setHoraCheckin(e.target.value)}
            style={inputStyle}
            disabled={modo24h}
            required
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Check-out
          <input
            type="time"
            value={horaCheckout}
            onChange={(e) => setHoraCheckout(e.target.value)}
            style={inputStyle}
            disabled={modo24h}
            required
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={modo24h} onChange={(e) => setModo24h(e.target.checked)} />
          Modo 24h (sin hora fija)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          Cobro por mascota (S/./día)
          <input
            type="number"
            min={0}
            step={0.01}
            value={precioMascota}
            onChange={(e) => setPrecioMascota(Number(e.target.value))}
            style={{ ...inputStyle, width: 100 }}
          />
        </label>
        <button type="submit" disabled={guardando} style={btnPrimary}>
          Guardar
        </button>
      </form>
    </section>
  );
}

function SeccionPersonal({
  hotelId,
  personal,
  onCambio,
  setError,
}: {
  hotelId: string;
  personal: PersonalHotel[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<RolHotel>('recepcion');
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [credencialesCreadas, setCredencialesCreadas] = useState<{ email: string; password: string } | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setCredencialesCreadas(null);
    try {
      const resultado = await api.post<{ email: string; password: string | null }>(
        `/hoteles/${hotelId}/personal`,
        { nombre, usuario, email, rol, password: password || undefined },
      );
      if (resultado.password) {
        setCredencialesCreadas({ email: resultado.email, password: resultado.password });
      }
      setNombre('');
      setUsuario('');
      setEmail('');
      setPassword('');
      setRol('recepcion');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Personal</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Crea el acceso al sistema para cada persona del hotel e indica su perfil: Administrador
        (todo, incluida esta pantalla), Recepcionista (operación diaria) o Housekeeping (solo
        tareas de limpieza/mantenimiento).
      </p>

      {credencialesCreadas && (
        <div
          style={{
            background: 'var(--brand-bg)',
            border: '1px solid var(--brand)',
            borderRadius: 'var(--radius)',
            padding: 12,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          Usuario creado. Contraseña generada (cópiala y compártela; no se vuelve a mostrar):{' '}
          <strong style={{ fontFamily: 'monospace' }}>{credencialesCreadas.password}</strong>
          <br />
          <button
            type="button"
            onClick={() => setCredencialesCreadas(null)}
            style={{ ...btnSecondary, marginTop: 8 }}
          >
            Entendido
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {personal.map((p) =>
          editandoId === p.id ? (
            <EditarAsignacionForm
              key={p.id}
              hotelId={hotelId}
              asignacion={p}
              onGuardado={() => {
                setEditandoId(null);
                onCambio();
              }}
              onCancelar={() => setEditandoId(null)}
              setError={setError}
            />
          ) : (
            <div key={p.id} style={filaStyle}>
              <span style={{ fontWeight: 500 }}>{p.personal?.nombre ?? '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>@{p.personal?.usuario ?? '—'}</span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--surface-0)',
                  border: '1px solid var(--border)',
                }}
              >
                {ROL_LABEL[p.rol]}
              </span>
              <span style={{ fontSize: 11, color: p.activo ? 'var(--disponible)' : 'var(--text-muted)' }}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </span>
              <button onClick={() => setEditandoId(p.id)} style={btnSecondary}>
                Editar
              </button>
            </div>
          ),
        )}
        {personal.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay personal registrado todavía.</p>}
      </div>

      <form onSubmit={crear} style={formInlineStyle}>
        <input placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...inputStyle, width: 180 }} required />
        <input placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} style={{ ...inputStyle, width: 140 }} required />
        <input
          type="email"
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
          required
        />
        <select value={rol} onChange={(e) => setRol(e.target.value as RolHotel)} style={{ ...inputStyle, width: 170 }}>
          <option value="admin">Administrador</option>
          <option value="recepcion">Recepcionista</option>
          <option value="hk">Housekeeping (HK)</option>
        </select>
        <input
          type="text"
          placeholder="Contraseña (opcional, se genera si se deja vacío)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Crear usuario
        </button>
      </form>
    </section>
  );
}

function EditarAsignacionForm({
  hotelId,
  asignacion,
  onGuardado,
  onCancelar,
  setError,
}: {
  hotelId: string;
  asignacion: PersonalHotel;
  onGuardado: () => void;
  onCancelar: () => void;
  setError: (e: string | null) => void;
}) {
  const [rol, setRol] = useState<RolHotel>(asignacion.rol);
  const [activo, setActivo] = useState(asignacion.activo);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/personal/${asignacion.id}`, { rol, activo });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ ...filaStyle, justifyContent: 'flex-start', gap: 8 }}>
      <span style={{ minWidth: 120, fontWeight: 500 }}>{asignacion.personal?.nombre ?? '—'}</span>
      <select value={rol} onChange={(e) => setRol(e.target.value as RolHotel)} style={{ ...inputStyle, width: 170 }}>
        <option value="admin">Administrador</option>
        <option value="recepcion">Recepcionista</option>
        <option value="hk">Housekeeping (HK)</option>
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Activo
      </label>
      <button type="submit" disabled={guardando} style={btnPrimary}>
        Guardar
      </button>
      <button type="button" onClick={onCancelar} style={btnSecondary}>
        Cancelar
      </button>
    </form>
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
  const [precioNormal, setPrecioNormal] = useState('');
  const [precioCorporativo, setPrecioCorporativo] = useState('');
  const [precioWeb, setPrecioWeb] = useState('');
  const [precioPorHora, setPrecioPorHora] = useState('');
  const [precioCosto, setPrecioCosto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tipos-habitacion`, {
        nombre,
        aforoMax,
        tiempoLimpiezaMin,
        precioNormal: Number(precioNormal),
        precioCorporativo: precioCorporativo ? Number(precioCorporativo) : undefined,
        precioWeb: precioWeb ? Number(precioWeb) : undefined,
        precioPorHora: precioPorHora ? Number(precioPorHora) : undefined,
        precioCosto: precioCosto ? Number(precioCosto) : undefined,
      });
      setNombre('');
      setPrecioNormal('');
      setPrecioCorporativo('');
      setPrecioWeb('');
      setPrecioPorHora('');
      setPrecioCosto('');
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

  async function eliminar(tipo: TipoHabitacion) {
    if (!confirm(`¿Eliminar el tipo "${tipo.nombre}"? Solo funciona si no tiene habitaciones ni tarifas asociadas.`)) return;
    setError(null);
    try {
      await api.delete(`/hoteles/${hotelId}/tipos-habitacion/${tipo.id}`);
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
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
            <div key={t.id} style={{ ...filaStyle, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>{t.nombre}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditandoId(t.id)} style={btnSecondary}>
                    Editar
                  </button>
                  <button onClick={() => alternarActivo(t)} style={btnSecondary}>
                    {t.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => eliminar(t)} style={btnDanger}>
                    Eliminar
                  </button>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>Aforo {t.aforo_max}</span>
                <span>Limpieza {t.tiempo_limpieza_min} min</span>
                <span>Normal: {t.precio_normal}</span>
                <span>Corporativo: {t.precio_corporativo}</span>
                <span>Web: {t.precio_web}</span>
                <span>Por hora: {t.precio_por_hora ?? '—'}</span>
                <span style={t.precio_costo > 0 ? {} : { color: 'var(--text-muted)' }}>
                  Costo: {t.precio_costo > 0 ? t.precio_costo : 'sin definir'}
                </span>
              </div>
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
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="Precio normal"
          value={precioNormal}
          onChange={(e) => setPrecioNormal(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
          required
        />
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="Corporativo (= normal)"
          value={precioCorporativo}
          onChange={(e) => setPrecioCorporativo(e.target.value)}
          style={{ ...inputStyle, width: 150 }}
        />
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="Web (= normal)"
          value={precioWeb}
          onChange={(e) => setPrecioWeb(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
        />
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="Por hora (opcional)"
          value={precioPorHora}
          onChange={(e) => setPrecioPorHora(e.target.value)}
          style={{ ...inputStyle, width: 140 }}
        />
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="Precio de costo"
          value={precioCosto}
          onChange={(e) => setPrecioCosto(e.target.value)}
          style={{ ...inputStyle, width: 120 }}
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
  const [precioNormal, setPrecioNormal] = useState(String(tipo.precio_normal));
  const [precioCorporativo, setPrecioCorporativo] = useState(String(tipo.precio_corporativo));
  const [precioWeb, setPrecioWeb] = useState(String(tipo.precio_web));
  const [precioPorHora, setPrecioPorHora] = useState(tipo.precio_por_hora != null ? String(tipo.precio_por_hora) : '');
  const [precioCosto, setPrecioCosto] = useState(String(tipo.precio_costo));
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
        precioNormal: Number(precioNormal),
        precioCorporativo: Number(precioCorporativo),
        precioWeb: Number(precioWeb),
        precioPorHora: precioPorHora ? Number(precioPorHora) : undefined,
        precioCosto: Number(precioCosto),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={guardar}
      style={{ ...filaStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 140 }} required />
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
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', gap: 2 }}>
          Normal
          <input
            type="number"
            min={0}
            step={0.01}
            value={precioNormal}
            onChange={(e) => setPrecioNormal(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', gap: 2 }}>
          Corporativo
          <input
            type="number"
            min={0}
            step={0.01}
            value={precioCorporativo}
            onChange={(e) => setPrecioCorporativo(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', gap: 2 }}>
          Web
          <input
            type="number"
            min={0}
            step={0.01}
            value={precioWeb}
            onChange={(e) => setPrecioWeb(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', gap: 2 }}>
          Por hora
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="opcional"
            value={precioPorHora}
            onChange={(e) => setPrecioPorHora(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 11, color: 'var(--text-secondary)', gap: 2 }}>
          Precio de costo
          <input
            type="number"
            min={0}
            step={0.01}
            value={precioCosto}
            onChange={(e) => setPrecioCosto(e.target.value)}
            style={{ ...inputStyle, width: 110 }}
            required
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={guardando} style={btnPrimary}>
          Guardar
        </button>
        <button type="button" onClick={onCancelar} style={btnSecondary}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SeccionHabitaciones({
  hotelId,
  tipos,
  habitaciones,
  onCambio,
  setError,
}: {
  hotelId: string;
  tipos: TipoHabitacion[];
  habitaciones: Habitacion[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [habNumero, setHabNumero] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [piso, setPiso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/habitaciones`, { habNumero: Number(habNumero), tipoId, piso });
      setHabNumero('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la habitación');
    } finally {
      setEnviando(false);
    }
  }

  async function cambiarEstado(hab: Habitacion, estado: string) {
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/habitaciones/${hab.id}`, { estado });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  async function eliminar(hab: Habitacion) {
    if (!confirm(`¿Eliminar la habitación ${hab.hab_numero}? Solo funciona si no tiene reservas ni historial.`)) return;
    setError(null);
    try {
      await api.delete(`/hoteles/${hotelId}/habitaciones/${hab.id}`);
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    }
  }

  const ordenadas = [...habitaciones].sort((a, b) => a.hab_numero - b.hab_numero);

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Habitaciones</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {ordenadas.map((h) =>
          editandoId === h.id ? (
            <EditarHabitacionForm
              key={h.id}
              hotelId={hotelId}
              habitacion={h}
              tipos={tipos}
              onGuardado={() => {
                setEditandoId(null);
                onCambio();
              }}
              onCancelar={() => setEditandoId(null)}
              setError={setError}
            />
          ) : (
            <div key={h.id} style={filaStyle}>
              <span>Hab. {h.hab_numero}</span>
              <span style={{ color: 'var(--text-secondary)' }}>Piso {h.piso}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{h.tipos_habitacion?.nombre ?? '—'}</span>
              <select
                value={h.estado}
                onChange={(e) => cambiarEstado(h, e.target.value)}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
              >
                <option value="disponible">Disponible</option>
                <option value="ocupada">Ocupada</option>
                <option value="limpieza">Limpieza</option>
                <option value="mantenimiento">Mantenimiento</option>
                <option value="bloqueada">Bloqueada</option>
              </select>
              <span style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditandoId(h.id)} style={btnSecondary}>
                  Editar
                </button>
                <button onClick={() => eliminar(h)} style={btnDanger}>
                  Eliminar
                </button>
              </span>
            </div>
          ),
        )}
        {habitaciones.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay habitaciones creadas.</p>}
      </div>
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

function EditarHabitacionForm({
  hotelId,
  habitacion,
  tipos,
  onGuardado,
  onCancelar,
  setError,
}: {
  hotelId: string;
  habitacion: Habitacion;
  tipos: TipoHabitacion[];
  onGuardado: () => void;
  onCancelar: () => void;
  setError: (e: string | null) => void;
}) {
  const [tipoId, setTipoId] = useState(habitacion.tipos_habitacion?.id ?? '');
  const [piso, setPiso] = useState(habitacion.piso);
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/habitaciones/${habitacion.id}`, { tipoId, piso });
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} style={{ ...filaStyle, justifyContent: 'flex-start', gap: 8 }}>
      <span style={{ minWidth: 70 }}>Hab. {habitacion.hab_numero}</span>
      <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} style={inputStyle} required>
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
      <button type="submit" disabled={guardando} style={btnPrimary}>
        Guardar
      </button>
      <button type="button" onClick={onCancelar} style={btnSecondary}>
        Cancelar
      </button>
    </form>
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

function SeccionBazar({
  hotelId,
  productos,
  onCambio,
  setError,
}: {
  hotelId: string;
  productos: ProductoBazar[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/productos-bazar`, { nombre, precio: Number(precio) });
      setNombre('');
      setPrecio('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el producto');
    } finally {
      setEnviando(false);
    }
  }

  async function alternarActivo(producto: ProductoBazar) {
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/productos-bazar/${producto.id}`, { activo: !producto.activo });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Bazar</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Productos que se le pueden vender al huésped durante su estadía (champú, gaseosa, etc.). Se
        registran desde el detalle de cada estadía.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {productos.map((p) =>
          editandoId === p.id ? (
            <EditarProductoBazarForm
              key={p.id}
              hotelId={hotelId}
              producto={p}
              onGuardado={() => {
                setEditandoId(null);
                onCambio();
              }}
              onCancelar={() => setEditandoId(null)}
              setError={setError}
            />
          ) : (
            <div key={p.id} style={filaStyle}>
              <span>{p.nombre}</span>
              <span style={{ color: 'var(--text-secondary)' }}>S/. {p.precio}</span>
              <span style={{ fontSize: 11, color: p.activo ? 'var(--disponible)' : 'var(--text-muted)' }}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setEditandoId(p.id)} style={btnSecondary}>
                  Editar
                </button>
                <button onClick={() => alternarActivo(p)} style={btnSecondary}>
                  {p.activo ? 'Desactivar' : 'Activar'}
                </button>
              </span>
            </div>
          ),
        )}
        {productos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay productos creados.</p>}
      </div>
      <form onSubmit={crear} style={formInlineStyle}>
        <input
          placeholder="Nombre (ej. Champú)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="Precio"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          style={{ ...inputStyle, width: 100 }}
          required
        />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Agregar producto
        </button>
      </form>
    </section>
  );
}

function EditarProductoBazarForm({
  hotelId,
  producto,
  onGuardado,
  onCancelar,
  setError,
}: {
  hotelId: string;
  producto: ProductoBazar;
  onGuardado: () => void;
  onCancelar: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState(producto.nombre);
  const [precio, setPrecio] = useState(String(producto.precio));
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/productos-bazar/${producto.id}`, {
        nombre,
        precio: Number(precio),
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
        min={0}
        step={0.01}
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        style={{ ...inputStyle, width: 100 }}
        required
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

function SeccionTiposDesayuno({
  hotelId,
  tipos,
  onCambio,
  setError,
}: {
  hotelId: string;
  tipos: TipoDesayuno[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tipos-desayuno`, { nombre, precio: Number(precio) });
      setNombre('');
      setPrecio('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el tipo de desayuno');
    } finally {
      setEnviando(false);
    }
  }

  async function alternarActivo(tipo: TipoDesayuno) {
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/tipos-desayuno/${tipo.id}`, { activo: !tipo.activo });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Tipos de desayuno</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Tipos de desayuno que se le pueden vender al huésped (ej. Continental, Americano), cada uno
        con su propio precio. Se registran desde el detalle de cada estadía. Si la tarifa del
        huésped ya incluye desayuno de cortesía, eso se marca al hacer el check-in, no aquí.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {tipos.map((t) =>
          editandoId === t.id ? (
            <EditarTipoDesayunoForm
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
              <span style={{ color: 'var(--text-secondary)' }}>S/. {t.precio}</span>
              <span style={{ fontSize: 11, color: t.activo ? 'var(--disponible)' : 'var(--text-muted)' }}>
                {t.activo ? 'Activo' : 'Inactivo'}
              </span>
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
        {tipos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay tipos de desayuno creados.</p>}
      </div>
      <form onSubmit={crear} style={formInlineStyle}>
        <input
          placeholder="Nombre (ej. Continental)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="Precio"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          style={{ ...inputStyle, width: 100 }}
          required
        />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Agregar tipo de desayuno
        </button>
      </form>
    </section>
  );
}

function EditarTipoDesayunoForm({
  hotelId,
  tipo,
  onGuardado,
  onCancelar,
  setError,
}: {
  hotelId: string;
  tipo: TipoDesayuno;
  onGuardado: () => void;
  onCancelar: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState(tipo.nombre);
  const [precio, setPrecio] = useState(String(tipo.precio));
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/tipos-desayuno/${tipo.id}`, {
        nombre,
        precio: Number(precio),
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
        min={0}
        step={0.01}
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        style={{ ...inputStyle, width: 100 }}
        required
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

function SeccionTurnos({
  hotelId,
  turnos,
  onCambio,
  setError,
}: {
  hotelId: string;
  turnos: Turno[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/turnos`, { nombre, horaInicio, horaFin });
      setNombre('');
      setHoraInicio('');
      setHoraFin('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el turno');
    } finally {
      setEnviando(false);
    }
  }

  async function alternarActivo(turno: Turno) {
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/turnos/${turno.id}`, { activo: !turno.activo });
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Turnos</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Turnos de trabajo (ej. Mañana, Tarde, Noche) que el personal elige al abrir su caja. Un
        turno inactivo deja de aparecer para abrir turnos nuevos, pero no afecta las sesiones ya
        registradas con él.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {turnos.map((t) =>
          editandoId === t.id ? (
            <EditarTurnoForm
              key={t.id}
              hotelId={hotelId}
              turno={t}
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
              <span style={{ color: 'var(--text-secondary)' }}>
                {t.hora_inicio.slice(0, 5)} – {t.hora_fin.slice(0, 5)}
              </span>
              <span style={{ fontSize: 11, color: t.activo ? 'var(--disponible)' : 'var(--text-muted)' }}>
                {t.activo ? 'Activo' : 'Inactivo'}
              </span>
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
        {turnos.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay turnos creados.</p>}
      </div>
      <form onSubmit={crear} style={formInlineStyle}>
        <input
          placeholder="Nombre (ej. Mañana)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="time"
          value={horaInicio}
          onChange={(e) => setHoraInicio(e.target.value)}
          style={{ ...inputStyle, width: 130 }}
          required
        />
        <input
          type="time"
          value={horaFin}
          onChange={(e) => setHoraFin(e.target.value)}
          style={{ ...inputStyle, width: 130 }}
          required
        />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          + Agregar turno
        </button>
      </form>
    </section>
  );
}

function EditarTurnoForm({
  hotelId,
  turno,
  onGuardado,
  onCancelar,
  setError,
}: {
  hotelId: string;
  turno: Turno;
  onGuardado: () => void;
  onCancelar: () => void;
  setError: (e: string | null) => void;
}) {
  const [nombre, setNombre] = useState(turno.nombre);
  const [horaInicio, setHoraInicio] = useState(turno.hora_inicio.slice(0, 5));
  const [horaFin, setHoraFin] = useState(turno.hora_fin.slice(0, 5));
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/turnos/${turno.id}`, { nombre, horaInicio, horaFin });
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
        type="time"
        value={horaInicio}
        onChange={(e) => setHoraInicio(e.target.value)}
        style={{ ...inputStyle, width: 130 }}
        required
      />
      <input
        type="time"
        value={horaFin}
        onChange={(e) => setHoraFin(e.target.value)}
        style={{ ...inputStyle, width: 130 }}
        required
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

function hoyYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

function SeccionTipoCambio({
  hotelId,
  registros,
  onCambio,
  setError,
}: {
  hotelId: string;
  registros: RegistroTipoCambio[];
  onCambio: () => void;
  setError: (e: string | null) => void;
}) {
  const [fecha, setFecha] = useState(hoyYMD());
  const [valorCompra, setValorCompra] = useState('');
  const [valorVenta, setValorVenta] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tipo-cambio`, {
        fecha,
        valorCompra: Number(valorCompra),
        valorVenta: Number(valorVenta),
      });
      setValorCompra('');
      setValorVenta('');
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el tipo de cambio');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: 15, marginBottom: 10 }}>Tipo de cambio</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Tipo de cambio SUNAT (compra/venta) del día. Se muestra siempre en la parte superior de la
        app y se usa para convertir a soles los pagos que un huésped hace en dólares. El sistema
        intenta traerlo solo de SUNAT en cuanto alguien abre la app y todavía no hay uno cargado
        hoy; este formulario sirve para corregirlo a mano si SUNAT no respondió o el valor está
        mal (guardar sobre una fecha existente la reemplaza).
      </p>
      <form onSubmit={guardar} style={formInlineStyle}>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ ...inputStyle, width: 150 }} required />
        <input
          type="number"
          min={0}
          step={0.001}
          placeholder="Compra"
          value={valorCompra}
          onChange={(e) => setValorCompra(e.target.value)}
          style={{ ...inputStyle, width: 100 }}
          required
        />
        <input
          type="number"
          min={0}
          step={0.001}
          placeholder="Venta"
          value={valorVenta}
          onChange={(e) => setValorVenta(e.target.value)}
          style={{ ...inputStyle, width: 100 }}
          required
        />
        <button type="submit" disabled={enviando} style={btnPrimary}>
          Guardar
        </button>
      </form>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {registros.map((r) => (
          <div key={r.fecha} style={filaStyle}>
            <span>{new Date(`${r.fecha}T00:00:00`).toLocaleDateString('es-PE')}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Compra: {Number(r.valor_compra).toFixed(3)}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Venta: {Number(r.valor_venta).toFixed(3)}</span>
          </div>
        ))}
        {registros.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Todavía no hay registros.</p>}
      </div>
    </section>
  );
}

const filaStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '4px 12px',
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

const btnDanger: CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--ocupada)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
};
