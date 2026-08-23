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

const NACIONALIDAD_LABEL: Record<string, string> = {
  peruano: 'Peruano',
  extranjero: 'Extranjero',
};

function formatoFechaNacimiento(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

interface Huesped {
  id: string;
  tipo_doc: string;
  nro_doc: string;
  nombres: string;
  apellidos: string;
  nacionalidad: string | null;
  origen: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  correo: string | null;
  ruc: string | null;
  razon_social: string | null;
}

export function Huespedes() {
  const { hotelActual } = useHotel();
  const [huespedes, setHuespedes] = useState<Huesped[]>([]);
  const [buscar, setBuscar] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [huespedEditando, setHuespedEditando] = useState<Huesped | null>(null);

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

  function abrirNuevo() {
    setHuespedEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(h: Huesped) {
    setHuespedEditando(h);
    setModalAbierto(true);
  }

  if (!hotelActual) return null;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Huéspedes</h1>
        <button style={btnPrimary} onClick={abrirNuevo}>
          + Nuevo huésped
        </button>
      </div>

      <form onSubmit={handleBuscarSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre, apellido, documento, RUC o razón social..."
          style={{ ...inputStyle, flex: 1, minWidth: 200, maxWidth: 420 }}
        />
        <button type="submit" style={btnSecondary}>
          Buscar
        </button>
      </form>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}

      {!loading && (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1080 }}>
            <thead>
              <tr
                style={{
                  textAlign: 'left',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                <th style={thStyle}>Documento</th>
                <th style={thStyle}>Nombres</th>
                <th style={thStyle}>Teléfono</th>
                <th style={thStyle}>Correo</th>
                <th style={thStyle}>Nacionalidad</th>
                <th style={thStyle}>F. nacimiento</th>
                <th style={thStyle}>RUC</th>
                <th style={thStyle}>Razón social</th>
                <th style={{ ...thStyle, textAlign: 'right', borderRight: 'none' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {huespedes.map((h, i) => (
                <tr
                  key={h.id}
                  style={{
                    borderTop: '2px solid var(--table-border)',
                    background: i % 2 === 1 ? 'var(--surface-1)' : 'transparent',
                  }}
                >
                  <td style={tdStyle}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {TIPOS_DOC.find((t) => t.value === h.tipo_doc)?.label ?? h.tipo_doc}
                    </span>{' '}
                    <span style={{ fontFamily: 'monospace' }}>{h.nro_doc}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {h.nombres} {h.apellidos}
                  </td>
                  <td style={tdStyle}>{h.telefono ?? '—'}</td>
                  <td style={tdStyle}>{h.correo ?? '—'}</td>
                  <td style={tdStyle}>
                    {h.nacionalidad ? (
                      <span
                        style={{
                          background: 'var(--surface-1)',
                          border: '1px solid var(--border)',
                          borderRadius: 999,
                          padding: '2px 8px',
                          fontSize: 11.5,
                        }}
                      >
                        {NACIONALIDAD_LABEL[h.nacionalidad] ?? h.nacionalidad}
                        {h.nacionalidad === 'extranjero' && h.origen ? ` · ${h.origen}` : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={tdStyle}>{formatoFechaNacimiento(h.fecha_nacimiento)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{h.ruc ?? '—'}</td>
                  <td style={tdStyle}>{h.razon_social ?? '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', borderRight: 'none' }}>
                    <button onClick={() => abrirEditar(h)} style={btnSecondary}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {huespedes.length === 0 && (
            <p style={{ color: 'var(--text-muted)', padding: 16 }}>No se encontraron huéspedes.</p>
          )}
        </div>
      )}

      {modalAbierto && (
        <HuespedFormModal
          hotelId={hotelActual.hotelId}
          huesped={huespedEditando}
          onClose={() => setModalAbierto(false)}
          onGuardado={() => {
            setModalAbierto(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function HuespedFormModal({
  hotelId,
  huesped,
  onClose,
  onGuardado,
}: {
  hotelId: string;
  huesped: Huesped | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [tipoDoc, setTipoDoc] = useState(huesped?.tipo_doc ?? 'dni');
  const [nroDoc, setNroDoc] = useState(huesped?.nro_doc ?? '');
  const [nombres, setNombres] = useState(huesped?.nombres ?? '');
  const [apellidos, setApellidos] = useState(huesped?.apellidos ?? '');
  const [telefono, setTelefono] = useState(huesped?.telefono ?? '');
  const [correo, setCorreo] = useState(huesped?.correo ?? '');
  const [nacionalidad, setNacionalidad] = useState(huesped?.nacionalidad ?? '');
  const [origen, setOrigen] = useState(huesped?.origen ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(huesped?.fecha_nacimiento ?? '');
  const [ruc, setRuc] = useState(huesped?.ruc ?? '');
  const [razonSocial, setRazonSocial] = useState(huesped?.razon_social ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const cuerpo = {
      tipoDoc,
      nroDoc,
      nombres,
      apellidos,
      telefono: telefono || undefined,
      correo: correo || undefined,
      nacionalidad: nacionalidad || undefined,
      origen: nacionalidad === 'extranjero' ? origen || undefined : undefined,
      fechaNacimiento: fechaNacimiento || undefined,
      ruc: ruc || undefined,
      razonSocial: razonSocial || undefined,
    };
    try {
      if (huesped) {
        await api.patch(`/hoteles/${hotelId}/huespedes/${huesped.id}`, cuerpo);
      } else {
        await api.post(`/hoteles/${hotelId}/huespedes`, cuerpo);
      }
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el huésped');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>{huesped ? 'Editar huésped' : 'Nuevo huésped'}</h2>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ width: 180 }}>
              <label style={labelStyle}>Tipo de documento</label>
              <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} style={inputStyle}>
                {TIPOS_DOC.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Número de documento</label>
              <input value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Nombres</label>
              <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} required />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Apellidos</label>
              <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Teléfono</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Correo</label>
              <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ width: 180 }}>
              <label style={labelStyle}>Nacionalidad</label>
              <select value={nacionalidad} onChange={(e) => setNacionalidad(e.target.value)} style={inputStyle}>
                <option value="">Sin especificar</option>
                <option value="peruano">Peruano</option>
                <option value="extranjero">Extranjero</option>
              </select>
            </div>
            {nacionalidad === 'extranjero' && (
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={labelStyle}>País de origen</label>
                <input
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value)}
                  placeholder="Ej. Colombia"
                  style={inputStyle}
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Fecha de nacimiento</label>
              <input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            RUC y razón social: del propio huésped si pidió factura a su nombre, o de la empresa que paga su
            estadía (ej. envía a su personal). Déjalo vacío si no aplica.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ width: 160 }}>
              <label style={labelStyle}>RUC</label>
              <input
                value={ruc}
                onChange={(e) => setRuc(e.target.value)}
                placeholder="11 dígitos"
                maxLength={11}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Razón social</label>
              <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando} style={btnPrimary}>
              {enviando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
  maxWidth: 560,
};

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
  fontSize: 13,
  borderRight: '2px solid var(--table-border)',
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: 3,
};

const inputStyle: CSSProperties = {
  width: '100%',
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
