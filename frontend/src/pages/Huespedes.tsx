import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

const TIPOS_DOC = [
  { value: 'dni', label: 'DNI' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'carnet_extranjeria', label: 'Carnet de extranjería' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'otro', label: 'Otro' },
];

interface Huesped {
  id: string;
  tipo_doc: string;
  nro_doc: string;
  nombres: string;
  apellidos: string;
  nacionalidad: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  correo: string | null;
}

export function Huespedes() {
  const { hotelActual } = useHotel();
  const [huespedes, setHuespedes] = useState<Huesped[]>([]);
  const [buscar, setBuscar] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    setError(null);
    const query = buscar.trim() ? `?buscar=${encodeURIComponent(buscar.trim())}` : '';
    api
      .get<Huesped[]>(`/hoteles/${hotelActual.hotelId}/huespedes${query}`)
      .then(setHuespedes)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, [hotelActual]);

  function handleBuscarSubmit(e: FormEvent) {
    e.preventDefault();
    cargar();
  }

  if (!hotelActual) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Huéspedes</h1>
        <button style={btnPrimary} onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo huésped'}
        </button>
      </div>

      {mostrarForm && (
        <NuevoHuespedForm
          hotelId={hotelActual.hotelId}
          onCreado={() => {
            setMostrarForm(false);
            cargar();
          }}
        />
      )}

      <form onSubmit={handleBuscarSubmit} style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre, apellido o documento..."
          style={{ ...inputStyle, flex: 1, maxWidth: 360 }}
        />
        <button type="submit" style={btnSecondary}>
          Buscar
        </button>
      </form>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {huespedes.map((h) =>
            editandoId === h.id ? (
              <EditarHuespedForm
                key={h.id}
                hotelId={hotelActual.hotelId}
                huesped={h}
                onGuardado={() => {
                  setEditandoId(null);
                  cargar();
                }}
                onCancelar={() => setEditandoId(null)}
              />
            ) : (
              <div key={h.id} style={filaStyle}>
                <span style={{ fontWeight: 500, minWidth: 180 }}>
                  {h.nombres} {h.apellidos}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {TIPOS_DOC.find((t) => t.value === h.tipo_doc)?.label ?? h.tipo_doc}: {h.nro_doc}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{h.telefono ?? '—'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{h.correo ?? '—'}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{h.nacionalidad ?? '—'}</span>
                <button onClick={() => setEditandoId(h.id)} style={btnSecondary}>
                  Editar
                </button>
              </div>
            ),
          )}
          {huespedes.length === 0 && (
            <p style={{ color: 'var(--text-muted)' }}>No se encontraron huéspedes.</p>
          )}
        </div>
      )}
    </div>
  );
}

function NuevoHuespedForm({ hotelId, onCreado }: { hotelId: string; onCreado: () => void }) {
  const [tipoDoc, setTipoDoc] = useState('dni');
  const [nroDoc, setNroDoc] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [nacionalidad, setNacionalidad] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/huespedes`, {
        tipoDoc,
        nroDoc,
        nombres,
        apellidos,
        telefono: telefono || undefined,
        correo: correo || undefined,
        nacionalidad: nacionalidad || undefined,
        fechaNacimiento: fechaNacimiento || undefined,
      });
      onCreado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar el huésped');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={crear}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} style={{ ...inputStyle, width: 170 }}>
          {TIPOS_DOC.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          value={nroDoc}
          onChange={(e) => setNroDoc(e.target.value)}
          placeholder="Número de documento"
          style={{ ...inputStyle, flex: 1 }}
          required
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={nombres} onChange={(e) => setNombres(e.target.value)} placeholder="Nombres" style={{ ...inputStyle, flex: 1 }} required />
        <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} placeholder="Apellidos" style={{ ...inputStyle, flex: 1 }} required />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" style={{ ...inputStyle, flex: 1 }} />
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Correo" style={{ ...inputStyle, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={nacionalidad}
          onChange={(e) => setNacionalidad(e.target.value)}
          placeholder="Nacionalidad (ej. Peruana)"
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          type="date"
          value={fechaNacimiento}
          onChange={(e) => setFechaNacimiento(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
      <button type="submit" disabled={enviando} style={{ ...btnPrimary, alignSelf: 'flex-start' }}>
        {enviando ? 'Registrando...' : 'Registrar huésped'}
      </button>
    </form>
  );
}

function EditarHuespedForm({
  hotelId,
  huesped,
  onGuardado,
  onCancelar,
}: {
  hotelId: string;
  huesped: Huesped;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const [tipoDoc, setTipoDoc] = useState(huesped.tipo_doc);
  const [nroDoc, setNroDoc] = useState(huesped.nro_doc);
  const [nombres, setNombres] = useState(huesped.nombres);
  const [apellidos, setApellidos] = useState(huesped.apellidos);
  const [telefono, setTelefono] = useState(huesped.telefono ?? '');
  const [correo, setCorreo] = useState(huesped.correo ?? '');
  const [nacionalidad, setNacionalidad] = useState(huesped.nacionalidad ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(huesped.fecha_nacimiento ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/huespedes/${huesped.id}`, {
        tipoDoc,
        nroDoc,
        nombres,
        apellidos,
        telefono: telefono || undefined,
        correo: correo || undefined,
        nacionalidad: nacionalidad || undefined,
        fechaNacimiento: fechaNacimiento || undefined,
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
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} style={{ ...inputStyle, width: 170 }}>
          {TIPOS_DOC.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
        <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={{ ...inputStyle, flex: 1 }} required />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" style={{ ...inputStyle, flex: 1 }} />
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Correo" style={{ ...inputStyle, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={nacionalidad}
          onChange={(e) => setNacionalidad(e.target.value)}
          placeholder="Nacionalidad"
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          type="date"
          value={fechaNacimiento}
          onChange={(e) => setFechaNacimiento(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
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

const filaStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: 'var(--surface-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  gap: 8,
};

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  boxSizing: 'border-box',
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
