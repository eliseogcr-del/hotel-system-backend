import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';
import { buscarHuespedPorDni, buscarHuespedPorRuc, buscarHuespedesPorTexto, type Huesped } from '../lib/huespedes';

const TIPOS_DOC = [
  { value: 'dni', label: 'DNI' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'carnet_extranjeria', label: 'Carnet de extranjería' },
  { value: 'cedula', label: 'Cédula' },
  { value: 'otro', label: 'Otro' },
];

const ORIGENES = ['walkin', 'telefono', 'whatsapp', 'booking', 'airbnb', 'directo'];

const TIPOS_VEHICULO = [
  { value: 'auto', label: 'Auto' },
  { value: 'camioneta', label: 'Camioneta' },
  { value: 'moto', label: 'Moto' },
  { value: 'otro', label: 'Otro' },
];

function ahoraLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// Date -> "YYYY-MM-DDTHH:mm" en hora local del navegador, el formato que
// espera un <input type="datetime-local">.
function aDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Mismo cálculo que EstadiasService.calcularCheckoutPrevisto() en el
// backend, para poder previsualizar la salida programada en el formulario
// sin ida y vuelta al servidor: check-in + días, a la hora de check-out
// configurada del hotel (o exactamente 24h*días después si el hotel opera
// en modo 24h).
function calcularCheckoutLocal(checkin: Date, dias: number, horaCheckoutHotel: string | undefined, modo24h: boolean): Date {
  if (modo24h) {
    return new Date(checkin.getTime() + dias * 24 * 60 * 60 * 1000);
  }
  const [hh, mm] = (horaCheckoutHotel ?? '12:00').split(':').map(Number);
  const salida = new Date(checkin);
  salida.setDate(salida.getDate() + dias);
  salida.setHours(hh, mm, 0, 0);
  return salida;
}

// Mismo criterio (ceil, mínimo 1 día) que ReservasService.calcularDias() en
// el backend: una salida programada el mismo día del check-in siempre
// cuenta como 1 día, aunque el huésped entre de mañana y salga esa misma
// noche.
function calcularDiasDesdeCheckout(checkin: Date, checkout: Date): number {
  const dias = Math.ceil((checkout.getTime() - checkin.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, dias);
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
  habTipo?: string | null;
  precios: TipoHabitacionPrecios | null;
  horaCheckoutHotel?: string;
  modo24h: boolean;
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
  habTipo,
  precios,
  horaCheckoutHotel,
  modo24h,
  onClose,
  onCreado,
}: Props) {
  const isMobile = useIsMobile();
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [mensajeBusqueda, setMensajeBusqueda] = useState<{ texto: string; encontrado: boolean } | null>(null);
  const [resultados, setResultados] = useState<Huesped[]>([]);

  const [nroDoc, setNroDoc] = useState('');
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
  const [facturable, setFacturable] = useState(false);

  const [origenReserva, setOrigenReserva] = useState('walkin');
  const [observaciones, setObservaciones] = useState('');

  const [nroPersonas, setNroPersonas] = useState(1);
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>('normal');
  const [tarifaDia, setTarifaDia] = useState(precioSegunTipoCliente(precios, 'normal'));
  const [dias, setDias] = useState(1);
  const [checkinPrevisto, setCheckinPrevisto] = useState(ahoraLocal());
  const [checkoutPrevisto, setCheckoutPrevisto] = useState(() =>
    aDatetimeLocal(calcularCheckoutLocal(new Date(ahoraLocal()), 1, horaCheckoutHotel, modo24h)),
  );
  // true apenas recepción edita la salida programada directamente en vez
  // de dejar que se calcule sola a partir de "Días" -- a partir de ahí el
  // checkout elegido manda y son los días los que se recalculan (ver
  // cambiarCheckoutPrevisto/cambiarDias/cambiarCheckinPrevisto más abajo).
  const [checkoutEditadoManual, setCheckoutEditadoManual] = useState(false);
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

  // "Días" y "Fecha y hora de salida programada" están sincronizados en
  // ambos sentidos (igual que fecha/noches/salida en CotizarWhatsapp.tsx):
  // editar días recalcula la salida (check-in + días, hora de check-out del
  // hotel); editar la salida directamente recalcula los días, y esa
  // elección manual queda fija aunque después se cambie el check-in (solo
  // se reajustan los días para reflejar la nueva diferencia).
  function cambiarDias(valorTexto: string) {
    const valor = valorTexto === '' ? 0 : Math.max(1, Number(valorTexto));
    setDias(valor);
    setCheckoutEditadoManual(false);
    if (valor > 0 && checkinPrevisto) {
      setCheckoutPrevisto(
        aDatetimeLocal(calcularCheckoutLocal(new Date(checkinPrevisto), valor, horaCheckoutHotel, modo24h)),
      );
    }
  }

  function cambiarCheckoutPrevisto(valor: string) {
    setCheckoutPrevisto(valor);
    setCheckoutEditadoManual(true);
    if (valor && checkinPrevisto) {
      setDias(calcularDiasDesdeCheckout(new Date(checkinPrevisto), new Date(valor)));
    }
  }

  function cambiarCheckinPrevisto(valor: string) {
    setCheckinPrevisto(valor);
    if (checkoutEditadoManual) {
      if (valor && checkoutPrevisto) {
        setDias(calcularDiasDesdeCheckout(new Date(valor), new Date(checkoutPrevisto)));
      }
    } else if (valor && dias > 0) {
      setCheckoutPrevisto(aDatetimeLocal(calcularCheckoutLocal(new Date(valor), dias, horaCheckoutHotel, modo24h)));
    }
  }

  function seleccionarHuesped(h: Huesped) {
    setTipoDoc(h.tipo_doc);
    setNroDoc(h.nro_doc);
    setNombres(h.nombres);
    setApellidos(h.apellidos);
    setTelefono(h.telefono ?? '');
    setCorreo(h.correo ?? '');
    setNacionalidad(h.nacionalidad ?? '');
    setOrigen(h.origen ?? '');
    setFechaNacimiento(h.fecha_nacimiento ?? '');
    setRuc(h.ruc ?? '');
    setRazonSocial(h.razon_social ?? '');
    setResultados([]);
    setMensajeBusqueda({ texto: 'Huésped encontrado — datos autocompletados.', encontrado: true });
  }

  // Búsqueda general por cualquiera de: DNI/documento exacto, RUC exacto
  // (11 dígitos), o nombre/apellido/razón social parcial -- mismo criterio
  // que ReservaFormModal.buscarCliente(). Si hay un único resultado se
  // autocompleta directo; si hay varios se listan para elegir; si no hay
  // ninguno, se limpian los campos y el recepcionista lo registra a mano.
  async function buscar() {
    const q = busqueda.trim();
    if (!q) return;
    setBuscando(true);
    setError(null);
    setResultados([]);
    setMensajeBusqueda(null);
    try {
      if (/^\d{11}$/.test(q)) {
        const porRuc = await buscarHuespedPorRuc(hotelId, q);
        if (porRuc) {
          seleccionarHuesped(porRuc);
          return;
        }
      }

      const porDoc = await buscarHuespedPorDni(hotelId, q);
      if (porDoc) {
        seleccionarHuesped(porDoc);
        return;
      }

      const varios = await buscarHuespedesPorTexto(hotelId, q);
      if (varios.length === 1) {
        seleccionarHuesped(varios[0]);
      } else if (varios.length > 1) {
        setResultados(varios);
      } else {
        setNombres('');
        setApellidos('');
        setTelefono('');
        setCorreo('');
        setNacionalidad('');
        setOrigen('');
        setFechaNacimiento('');
        setRuc('');
        setRazonSocial('');
        setMensajeBusqueda({
          texto: 'No se encontró ese huésped en la base de datos: complete los datos abajo para registrarlo.',
          encontrado: false,
        });
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
        facturable,
        nroPersonas,
        tarifaDia,
        dias,
        checkinPrevisto: new Date(checkinPrevisto).toISOString(),
        checkoutPrevisto: checkoutEditadoManual ? new Date(checkoutPrevisto).toISOString() : undefined,
        cobroEarlyManual: cobroEarly === '' ? undefined : Number(cobroEarly),
        incluyeDesayuno,
        cocheraId: tieneVehiculo && cocheraId ? cocheraId : undefined,
        vehiculoMarca: tieneVehiculo ? vehiculoMarca.trim() || undefined : undefined,
        vehiculoTipo: tieneVehiculo ? vehiculoTipo.trim() || undefined : undefined,
        vehiculoPlaca: tieneVehiculo ? vehiculoPlaca.trim() || undefined : undefined,
        origenReserva,
        observaciones: observaciones.trim() || undefined,
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
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>
          Check-in · Habitación {habNumero}
          {habTipo ? <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> ({habTipo})</span> : null}
        </h2>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ---------- Búsqueda ---------- */}
          <div style={cardStyle}>
            <p style={cardTitleStyle}>Buscar huésped</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setMensajeBusqueda(null);
                  setResultados([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    buscar();
                  }
                }}
                placeholder="DNI, nombre, apellido, RUC o razón social"
                style={{ ...inputStyle, flex: 1, minWidth: 220 }}
              />
              {buscando && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Buscando...</span>}
            </div>
            {mensajeBusqueda && (
              <p
                style={{
                  fontSize: 11,
                  color: mensajeBusqueda.encontrado ? 'var(--disponible)' : 'var(--text-muted)',
                  margin: '6px 0 0',
                }}
              >
                {mensajeBusqueda.texto}
              </p>
            )}
            {resultados.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>
                    Se encontró más de un huésped, elige uno:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResultados([]);
                      setMensajeBusqueda(null);
                    }}
                    style={{ ...btnSecondary, padding: '2px 8px', fontSize: 11 }}
                  >
                    Cancelar (registrar manualmente)
                  </button>
                </div>
                {resultados.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => seleccionarHuesped(h)}
                    style={{ ...btnSecondary, textAlign: 'left' }}
                  >
                    {h.apellidos}, {h.nombres} — {h.tipo_doc.toUpperCase()} {h.nro_doc}
                    {h.razon_social ? ` — ${h.razon_social}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---------- Datos personales + Nacionalidad/facturación ---------- */}
          <div style={gridRowStyle}>
            <div style={cardStyle}>
              <p style={cardTitleStyle}>Datos personales</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 150 }}>
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
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 8 }}>
                <input type="checkbox" checked={facturable} onChange={(e) => setFacturable(e.target.checked)} />
                Facturable (se le emitirá boleta/factura)
              </label>
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
                    onChange={(e) => cambiarDias(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>Origen</label>
                  <select value={origenReserva} onChange={(e) => setOrigenReserva(e.target.value)} style={inputStyle}>
                    {ORIGENES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={labelStyle}>Observaciones</label>
                  <input
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej. huésped extra no registrado, pidió toallas adicionales..."
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={labelStyle}>Fecha y hora de check-in</label>
                  <input
                    type="datetime-local"
                    value={checkinPrevisto}
                    onChange={(e) => cambiarCheckinPrevisto(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={labelStyle}>Fecha y hora de salida programada</label>
                  <input
                    type="datetime-local"
                    value={checkoutPrevisto}
                    onChange={(e) => cambiarCheckoutPrevisto(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={incluyeDesayuno} onChange={(e) => setIncluyeDesayuno(e.target.checked)} />
                Incluye desayuno (cortesía, no se cobra)
              </label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                La salida programada se calcula sola a partir de los días (check-in + días, según la hora de
                check-out del hotel) -- o edítala directamente y los días se ajustan solos (si sale el mismo día
                del check-in, siempre cuenta como 1 día).
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
                  <select value={vehiculoTipo} onChange={(e) => setVehiculoTipo(e.target.value)} style={inputStyle}>
                    <option value="">Sin especificar</option>
                    {TIPOS_VEHICULO.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
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
  background: 'var(--form-bg)',
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
  background: 'var(--surface-1)',
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
