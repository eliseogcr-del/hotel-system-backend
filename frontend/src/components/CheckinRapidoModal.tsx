import { useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { buscarHuespedPorDni } from '../lib/huespedes';

const TIPOS_DOC = [
  { value: 'dni', label: 'DNI' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'carnet_extranjeria', label: 'Carnet de extranjería' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'otro', label: 'Otro' },
];

function ahoraLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

interface Props {
  hotelId: string;
  habitacionId: string;
  habNumero: number;
  tarifaNormalDefault: number | null;
  onClose: () => void;
  onCreado: () => void;
}

export function CheckinRapidoModal({
  hotelId,
  habitacionId,
  habNumero,
  tarifaNormalDefault,
  onClose,
  onCreado,
}: Props) {
  const [nroDoc, setNroDoc] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [huespedEncontrado, setHuespedEncontrado] = useState<boolean | null>(null);

  const [tipoDoc, setTipoDoc] = useState('dni');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [nacionalidad, setNacionalidad] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');

  const [nroPersonas, setNroPersonas] = useState(1);
  const [tarifaDia, setTarifaDia] = useState(tarifaNormalDefault ?? 0);
  const [dias, setDias] = useState(1);
  const [checkinPrevisto, setCheckinPrevisto] = useState(ahoraLocal());
  const [cobroEarly, setCobroEarly] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    if (!nroDoc.trim()) return;
    setBuscando(true);
    setError(null);
    try {
      const huesped = await buscarHuespedPorDni(hotelId, nroDoc.trim());
      if (huesped) {
        setHuespedEncontrado(true);
        setTipoDoc(huesped.tipo_doc);
        setNombres(huesped.nombres);
        setApellidos(huesped.apellidos);
        setTelefono(huesped.telefono ?? '');
        setCorreo(huesped.correo ?? '');
        setNacionalidad(huesped.nacionalidad ?? '');
        setFechaNacimiento(huesped.fecha_nacimiento ?? '');
      } else {
        setHuespedEncontrado(false);
        setNombres('');
        setApellidos('');
        setTelefono('');
        setCorreo('');
        setNacionalidad('');
        setFechaNacimiento('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el huésped');
    } finally {
      setBuscando(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/estadias/checkin-rapido`, {
        habitacionId,
        nroDoc: nroDoc.trim(),
        tipoDoc,
        nombres: nombres.trim() || undefined,
        apellidos: apellidos.trim() || undefined,
        telefono: telefono.trim() || undefined,
        correo: correo.trim() || undefined,
        nacionalidad: nacionalidad.trim() || undefined,
        fechaNacimiento: fechaNacimiento || undefined,
        nroPersonas,
        tarifaDia,
        dias,
        checkinPrevisto: new Date(checkinPrevisto).toISOString(),
        cobroEarlyManual: cobroEarly === '' ? undefined : Number(cobroEarly),
      });
      onCreado();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo hacer el check-in');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>Check-in · Habitación {habNumero}</h2>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Documento del huésped</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} style={{ ...inputStyle, width: 160 }}>
                {TIPOS_DOC.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                value={nroDoc}
                onChange={(e) => {
                  setNroDoc(e.target.value);
                  setHuespedEncontrado(null);
                }}
                placeholder="Número de documento"
                style={{ ...inputStyle, flex: 1 }}
                required
              />
              <button type="button" onClick={buscar} disabled={buscando || !nroDoc.trim()} style={btnSecondary}>
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {huespedEncontrado === true && (
              <p style={{ fontSize: 11, color: 'var(--disponible)', margin: '4px 0 0' }}>
                Huésped ya registrado — datos autocompletados.
              </p>
            )}
            {huespedEncontrado === false && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                No se encontró: complete los datos para registrarlo.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nombres</label>
              <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Apellidos</label>
              <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} required />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Teléfono</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Correo</label>
              <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nacionalidad</label>
              <input
                value={nacionalidad}
                onChange={(e) => setNacionalidad(e.target.value)}
                placeholder="Peruana"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
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

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 110 }}>
              <label style={labelStyle}>N° personas</label>
              <input
                type="number"
                min={1}
                value={nroPersonas}
                onChange={(e) => setNroPersonas(Number(e.target.value))}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ width: 130 }}>
              <label style={labelStyle}>Tarifa/día (S/.)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={tarifaDia}
                onChange={(e) => setTarifaDia(Number(e.target.value))}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ width: 90 }}>
              <label style={labelStyle}>Días</label>
              <input
                type="number"
                min={1}
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                style={inputStyle}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Fecha y hora de check-in</label>
              <input
                type="datetime-local"
                value={checkinPrevisto}
                onChange={(e) => setCheckinPrevisto(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ width: 160 }}>
              <label style={labelStyle}>Cargo early (S/.)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="Automático"
                value={cobroEarly}
                onChange={(e) => setCobroEarly(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-8px 0 0' }}>
            La salida programada se calcula sola (check-in + días, según la hora de check-out del hotel).
            El cargo early: vacío = se calcula solo (50% de la tarifa si ingresa antes de la hora de
            check-in); pon 0 para no cobrarlo.
          </p>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando} style={btnPrimary}>
              {enviando ? 'Registrando...' : 'Confirmar check-in'}
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
