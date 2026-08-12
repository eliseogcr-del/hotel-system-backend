import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';
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

type TipoCliente = 'normal' | 'corporativo' | 'web';

interface TipoHabitacionPrecios {
  id: string;
  precio_normal: number;
  precio_corporativo: number;
  precio_web: number;
  precio_por_hora: number | null;
  precio_costo: number;
}

interface Cochera {
  id: string;
  numero: string;
  tamano: string;
  tipo_vehiculo_permitido: string | null;
  estado: string;
  es_externa: boolean;
}

interface Props {
  hotelId: string;
  habitacionId: string;
  habNumero: number;
  precios: TipoHabitacionPrecios | null;
  onClose: () => void;
  onCreado: () => void;
}

function precioSegunTipoCliente(precios: TipoHabitacionPrecios | null, tipoCliente: TipoCliente): number {
  if (!precios) return 0;
  if (tipoCliente === 'corporativo') return Number(precios.precio_corporativo);
  if (tipoCliente === 'web') return Number(precios.precio_web);
  return Number(precios.precio_normal);
}

export function CheckinRapidoModal({
  hotelId,
  habitacionId,
  habNumero,
  precios,
  onClose,
  onCreado,
}: Props) {
  const isMobile = useIsMobile();
  const [nroDoc, setNroDoc] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [huespedEncontrado, setHuespedEncontrado] = useState<boolean | null>(null);

  const [tipoDoc, setTipoDoc] = useState('dni');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [nacionalidad, setNacionalidad] = useState('');
  const [origen, setOrigen] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');

  const [nroPersonas, setNroPersonas] = useState(1);
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>('normal');
  const [tarifaDia, setTarifaDia] = useState(precioSegunTipoCliente(precios, 'normal'));
  const [dias, setDias] = useState(1);
  const [checkinPrevisto, setCheckinPrevisto] = useState(ahoraLocal());
  const [cobroEarly, setCobroEarly] = useState('');
  const [incluyeDesayuno, setIncluyeDesayuno] = useState(false);

  const [tieneVehiculo, setTieneVehiculo] = useState(false);
  const [vehiculoMarca, setVehiculoMarca] = useState('');
  const [vehiculoTipo, setVehiculoTipo] = useState('');
  const [vehiculoPlaca, setVehiculoPlaca] = useState('');
  const [cocheras, setCocheras] = useState<Cochera[]>([]);
  const [cocheraId, setCocheraId] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Cochera[]>(`/hoteles/${hotelId}/cocheras`).then(setCocheras).catch(() => {});
  }, [hotelId]);

  const cocherasDisponibles = cocheras.filter((c) => c.estado === 'disponible');
  const precioCosto = precios ? Number(precios.precio_costo) : 0;
  const tarifaBajoCosto = precioCosto > 0 && tarifaDia < precioCosto;

  function cambiarTipoCliente(valor: TipoCliente) {
    setTipoCliente(valor);
    setTarifaDia(precioSegunTipoCliente(precios, valor));
  }

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
        setOrigen(huesped.origen ?? '');
        setFechaNacimiento(huesped.fecha_nacimiento ?? '');
        setRuc(huesped.ruc ?? '');
        setRazonSocial(huesped.razon_social ?? '');
      } else {
        setHuespedEncontrado(false);
        setNombres('');
        setApellidos('');
        setTelefono('');
        setCorreo('');
        setNacionalidad('');
        setOrigen('');
        setFechaNacimiento('');
        setRuc('');
        setRazonSocial('');
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
        nacionalidad: nacionalidad || undefined,
        origen: nacionalidad === 'extranjero' ? origen.trim() || undefined : undefined,
        fechaNacimiento: fechaNacimiento || undefined,
        ruc: ruc.trim() || undefined,
        razonSocial: razonSocial.trim() || undefined,
        nroPersonas,
        tarifaDia,
        dias,
        checkinPrevisto: new Date(checkinPrevisto).toISOString(),
        cobroEarlyManual: cobroEarly === '' ? undefined : Number(cobroEarly),
        incluyeDesayuno,
        cocheraId: tieneVehiculo && cocheraId ? cocheraId : undefined,
        vehiculoMarca: tieneVehiculo ? vehiculoMarca.trim() || undefined : undefined,
        vehiculoTipo: tieneVehiculo ? vehiculoTipo.trim() || undefined : undefined,
        vehiculoPlaca: tieneVehiculo ? vehiculoPlaca.trim() || undefined : undefined,
      });
      onCreado();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo hacer el check-in');
    } finally {
      setEnviando(false);
    }
  }

  const gridRowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: 16,
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: isMobile ? 560 : 960 }}>
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>Check-in · Habitación {habNumero}</h2>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ---------- Documento ---------- */}
          <div style={cardStyle}>
            <p style={cardTitleStyle}>Documento del huésped</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
                style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                required
              />
              <button type="button" onClick={buscar} disabled={buscando || !nroDoc.trim()} style={btnSecondary}>
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {huespedEncontrado === true && (
              <p style={{ fontSize: 11, color: 'var(--disponible)', margin: '6px 0 0' }}>
                Huésped ya registrado — datos autocompletados.
              </p>
            )}
            {huespedEncontrado === false && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                No se encontró: complete los datos para registrarlo.
              </p>
            )}
          </div>

          {/* ---------- Datos personales + Nacionalidad/facturación ---------- */}
          <div style={gridRowStyle}>
            <div style={cardStyle}>
              <p style={cardTitleStyle}>Datos personales</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
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
            </div>

            <div style={cardStyle}>
              <p style={cardTitleStyle}>Nacionalidad y facturación</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>Nacionalidad</label>
                  <select value={nacionalidad} onChange={(e) => setNacionalidad(e.target.value)} style={inputStyle}>
                    <option value="">Sin especificar</option>
                    <option value="peruano">Peruano</option>
                    <option value="extranjero">Extranjero</option>
                  </select>
                </div>
                {nacionalidad === 'extranjero' && (
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={labelStyle}>País de origen</label>
                    <input value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="Ej. Colombia" style={inputStyle} />
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>RUC</label>
                  <input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="11 dígitos" maxLength={11} style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Razón social</label>
                  <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                RUC y razón social: del propio huésped si pidió factura a su nombre, o de la empresa que paga su
                estadía. Déjalo vacío si no aplica.
              </p>
            </div>
          </div>

          {/* ---------- Estancia + Tarifa ---------- */}
          <div style={gridRowStyle}>
            <div style={cardStyle}>
              <p style={cardTitleStyle}>Estancia</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
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
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={labelStyle}>Tipo de cliente</label>
                  <select
                    value={tipoCliente}
                    onChange={(e) => cambiarTipoCliente(e.target.value as TipoCliente)}
                    style={inputStyle}
                  >
                    <option value="normal">Normal</option>
                    <option value="corporativo">Corporativo</option>
                    <option value="web">Web</option>
                  </select>
                </div>
                <div style={{ width: 80 }}>
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
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Fecha y hora de check-in</label>
                <input
                  type="datetime-local"
                  value={checkinPrevisto}
                  onChange={(e) => setCheckinPrevisto(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={incluyeDesayuno} onChange={(e) => setIncluyeDesayuno(e.target.checked)} />
                Incluye desayuno (cortesía, no se cobra)
              </label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                La salida programada se calcula sola (check-in + días, según la hora de check-out del hotel).
              </p>
            </div>

            <div style={cardStyle}>
              <p style={cardTitleStyle}>Tarifa</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>Tarifa/día (S/.)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tarifaDia}
                    onChange={(e) => setTarifaDia(Number(e.target.value))}
                    style={{
                      ...inputStyle,
                      ...(tarifaBajoCosto ? { borderColor: 'var(--danger)' } : {}),
                    }}
                    required
                  />
                </div>
                <div style={{ width: 150 }}>
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
              <p style={{ fontSize: 11, color: tarifaBajoCosto ? 'var(--danger)' : 'var(--text-muted)', margin: 0 }}>
                {precioCosto > 0
                  ? `Precio de costo: S/. ${precioCosto}${tarifaBajoCosto ? ' — la tarifa no puede quedar por debajo de este valor.' : ''}`
                  : 'Este tipo de habitación no tiene un precio de costo configurado.'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                Cargo early: vacío = se calcula solo (50% de la tarifa si ingresa antes de la hora de check-in);
                pon 0 para no cobrarlo.
              </p>
            </div>
          </div>

          {/* ---------- Vehículo y cochera ---------- */}
          <div style={cardStyle}>
            <p style={cardTitleStyle}>Vehículo y cochera</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: tieneVehiculo ? 8 : 0 }}>
              <input type="checkbox" checked={tieneVehiculo} onChange={(e) => setTieneVehiculo(e.target.checked)} />
              El huésped tiene vehículo
            </label>
            {tieneVehiculo && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ width: 160 }}>
                  <label style={labelStyle}>Marca</label>
                  <input value={vehiculoMarca} onChange={(e) => setVehiculoMarca(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ width: 140 }}>
                  <label style={labelStyle}>Tipo</label>
                  <input
                    value={vehiculoTipo}
                    onChange={(e) => setVehiculoTipo(e.target.value)}
                    placeholder="Auto, camioneta..."
                    style={inputStyle}
                  />
                </div>
                <div style={{ width: 140 }}>
                  <label style={labelStyle}>Placa</label>
                  <input value={vehiculoPlaca} onChange={(e) => setVehiculoPlaca(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={labelStyle}>Cochera</label>
                  <select value={cocheraId} onChange={(e) => setCocheraId(e.target.value)} style={inputStyle}>
                    <option value="">Sin asignar</option>
                    {cocherasDisponibles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numero} ({c.tamano}
                        {c.tipo_vehiculo_permitido ? ` · ${c.tipo_vehiculo_permitido}` : ''}
                        {c.es_externa ? ' · externa' : ''})
                      </option>
                    ))}
                  </select>
                  {cocherasDisponibles.length === 0 && (
                    <p style={{ fontSize: 11, color: 'var(--danger)', margin: '4px 0 0' }}>
                      No se puede asignar cochera: todas están ocupadas ahora mismo.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando || tarifaBajoCosto} style={btnPrimary}>
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
};

const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 14,
  background: 'var(--surface-1)',
};

const cardTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-secondary)',
  margin: '0 0 10px',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
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
