import { useState, type CSSProperties, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { API_URL } from '../lib/api';

type TipoDoc = 'dni' | 'pasaporte' | 'carnet_extranjeria' | 'cedula' | 'otro';
type TipoVehiculo = 'auto' | 'camioneta' | 'moto' | 'otro';

const TIPO_DOC_LABEL: Record<TipoDoc, string> = {
  dni: 'DNI',
  pasaporte: 'Pasaporte',
  carnet_extranjeria: 'Carné de extranjería',
  cedula: 'Cédula',
  otro: 'Otro',
};

const TIPO_VEHICULO_LABEL: Record<TipoVehiculo, string> = {
  auto: 'Auto',
  camioneta: 'Camioneta',
  moto: 'Moto',
  otro: 'Otro',
};

interface RespuestaCotizacion {
  modo: 'directo' | 'grupo';
  disponible: boolean;
  mensaje?: string;
  cotizacion?: {
    id: string;
    total_estimado: number | null;
    moneda: string;
    estado: string;
  };
}

// Formulario público (sin login) al que el agente de WhatsApp le manda el
// link al cliente para cotizar solo -- ver CLAUDE.md, agente de WhatsApp.
// No pasa por api.ts (esa capa asume una sesión de Supabase) ni por
// ProtectedRoute: se agrega como ruta pública en App.tsx.
export function CotizarWhatsapp() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('dni');
  const [nroDoc, setNroDoc] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [horaIngreso, setHoraIngreso] = useState('15:00');
  const [noches, setNoches] = useState(1);
  const [personas, setPersonas] = useState(1);
  const [mascota, setMascota] = useState(false);
  const [vehiculo, setVehiculo] = useState(false);
  const [tipoVehiculo, setTipoVehiculo] = useState<TipoVehiculo>('auto');
  const [facturable, setFacturable] = useState(false);
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [cambiarSalida, setCambiarSalida] = useState(false);
  const [fechaSalida, setFechaSalida] = useState('');
  const [horaSalida, setHoraSalida] = useState('12:00');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespuestaCotizacion | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hotelId) return;
    setEnviando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch(`${API_URL}/publico/hoteles/${hotelId}/cotizaciones-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoDoc,
          nroDoc,
          nombres,
          apellidos,
          telefono,
          fechaIngreso,
          horaIngreso,
          noches,
          personas,
          mascota,
          vehiculo,
          tipoVehiculo: vehiculo ? tipoVehiculo : undefined,
          facturable,
          ruc: facturable ? ruc : undefined,
          razonSocial: facturable ? razonSocial : undefined,
          fechaSalida: cambiarSalida ? fechaSalida : undefined,
          horaSalida: cambiarSalida ? horaSalida : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message ?? 'No se pudo generar la cotización');
      }
      setResultado(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la cotización');
    } finally {
      setEnviando(false);
    }
  }

  if (!hotelId) return null;

  if (resultado) {
    return (
      <Contenedor>
        {resultado.disponible ? (
          resultado.modo === 'directo' ? (
            <>
              <h1 style={tituloStyle}>¡Cotización lista!</h1>
              <p style={{ fontSize: 15 }}>
                Total estimado: <b>S/. {Number(resultado.cotizacion?.total_estimado ?? 0).toFixed(2)}</b>
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                En breve te llegará el detalle por WhatsApp. Si tienes dudas, escríbenos por el mismo chat.
              </p>
            </>
          ) : (
            <>
              <h1 style={tituloStyle}>¡Recibimos tu pedido!</h1>
              <p style={{ fontSize: 14 }}>
                Por ser un grupo grande, el hotel va a confirmarte el precio directamente por WhatsApp antes
                de cerrar la cotización.
              </p>
            </>
          )
        ) : (
          <>
            <h1 style={tituloStyle}>Sin disponibilidad</h1>
            <p style={{ fontSize: 14 }}>{resultado.mensaje}</p>
          </>
        )}
      </Contenedor>
    );
  }

  return (
    <Contenedor>
      <h1 style={tituloStyle}>Cotiza tu estadía</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={filaStyle}>
          <Campo label="Tipo de documento">
            <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as TipoDoc)} style={inputStyle}>
              {Object.entries(TIPO_DOC_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Número de documento">
            <input value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} style={inputStyle} required />
          </Campo>
        </div>

        <div style={filaStyle}>
          <Campo label="Nombres">
            <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} required />
          </Campo>
          <Campo label="Apellidos">
            <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} required />
          </Campo>
        </div>

        <Campo label="Teléfono">
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} style={inputStyle} required />
        </Campo>

        <div style={filaStyle}>
          <Campo label="Fecha de llegada">
            <input
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              style={inputStyle}
              required
            />
          </Campo>
          <Campo label="Hora de llegada">
            <input
              type="time"
              value={horaIngreso}
              onChange={(e) => setHoraIngreso(e.target.value)}
              style={inputStyle}
              required
            />
          </Campo>
        </div>

        <div style={filaStyle}>
          <Campo label="Cantidad de personas">
            <input
              type="number"
              min={1}
              value={personas}
              onChange={(e) => setPersonas(Math.max(1, Number(e.target.value)))}
              style={inputStyle}
              required
            />
          </Campo>
          <Campo label="Cantidad de noches">
            <input
              type="number"
              min={1}
              value={noches}
              onChange={(e) => setNoches(Math.max(1, Number(e.target.value)))}
              style={inputStyle}
              required
            />
          </Campo>
        </div>

        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={cambiarSalida} onChange={(e) => setCambiarSalida(e.target.checked)} />
          Quiero elegir la fecha/hora de salida (por defecto sale a las 12:00 del día calculado por las noches)
        </label>
        {cambiarSalida && (
          <div style={filaStyle}>
            <Campo label="Fecha de salida">
              <input
                type="date"
                value={fechaSalida}
                onChange={(e) => setFechaSalida(e.target.value)}
                style={inputStyle}
                required={cambiarSalida}
              />
            </Campo>
            <Campo label="Hora de salida">
              <input
                type="time"
                value={horaSalida}
                onChange={(e) => setHoraSalida(e.target.value)}
                style={inputStyle}
                required={cambiarSalida}
              />
            </Campo>
          </div>
        )}

        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={mascota} onChange={(e) => setMascota(e.target.checked)} />
          ¿Viene con mascota?
        </label>

        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={vehiculo} onChange={(e) => setVehiculo(e.target.checked)} />
          ¿Tiene vehículo?
        </label>
        {vehiculo && (
          <Campo label="Tipo de vehículo">
            <select
              value={tipoVehiculo}
              onChange={(e) => setTipoVehiculo(e.target.value as TipoVehiculo)}
              style={inputStyle}
            >
              {Object.entries(TIPO_VEHICULO_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={facturable} onChange={(e) => setFacturable(e.target.checked)} />
          ¿Necesitas factura con RUC?
        </label>
        {facturable && (
          <div style={filaStyle}>
            <Campo label="RUC">
              <input value={ruc} onChange={(e) => setRuc(e.target.value)} style={inputStyle} required={facturable} />
            </Campo>
            <Campo label="Razón social">
              <input
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                style={inputStyle}
                required={facturable}
              />
            </Campo>
          </div>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

        <button type="submit" disabled={enviando} style={botonStyle}>
          {enviando ? 'Cotizando...' : 'Cotizar'}
        </button>
      </form>
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        background: 'var(--surface-0)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: 1 }}>
      {label}
      {children}
    </label>
  );
}

const tituloStyle: CSSProperties = { fontSize: 19, marginBottom: 16 };

const filaStyle: CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' };

const inputStyle: CSSProperties = {
  padding: '9px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
};

const botonStyle: CSSProperties = {
  marginTop: 8,
  padding: '11px',
  background: 'var(--brand)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius)',
  fontSize: 15,
  fontWeight: 500,
};
