import { useEffect, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { API_URL } from '../lib/api';

// YYYY-MM-DD + N días -> YYYY-MM-DD, sin líos de zona horaria (mismo patrón
// que sumarDiasYMD en el backend, ver CotizacionPublicaService).
function sumarDiasYMD(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function calcularNoches(fechaDesde: string, fechaHasta: string): number {
  return Math.max(
    1,
    Math.ceil((new Date(fechaHasta).getTime() - new Date(fechaDesde).getTime()) / (1000 * 60 * 60 * 24)),
  );
}

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

interface RespuestaReserva {
  modo: 'reserva';
  id: string;
  importe_final: number;
  moneda: string;
}

interface InfoHotel {
  nombre: string;
  agenteActivo: boolean;
  horaCheckin: string;
  horaCheckout: string;
  // Grupos hasta este tamaño ven la lista de habitaciones reales y reservan
  // directo; grupos más grandes siguen el flujo de cotización con revisión
  // humana (ver CLAUDE.md, agente de WhatsApp).
  umbralGrupoGrande: number;
}

interface HabitacionDisponible {
  habitacionId: string;
  numero: number;
  tipo: string;
  aforoMax: number;
  precioNoche: number;
  importe: number;
}

// Formulario público (sin login) al que el agente de WhatsApp le manda el
// link al cliente para cotizar solo -- ver CLAUDE.md, agente de WhatsApp.
// No pasa por api.ts (esa capa asume una sesión de Supabase) ni por
// ProtectedRoute: se agrega como ruta pública en App.tsx.
export function CotizarWhatsapp() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const [info, setInfo] = useState<InfoHotel | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
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
  const [resultado, setResultado] = useState<RespuestaCotizacion | RespuestaReserva | null>(null);

  const [habitacionesDisponibles, setHabitacionesDisponibles] = useState<HabitacionDisponible[] | null>(null);
  const [otrasHabitacionesDisponibles, setOtrasHabitacionesDisponibles] = useState<HabitacionDisponible[]>([]);
  const [mostrarOtrasHabitaciones, setMostrarOtrasHabitaciones] = useState(false);
  const [buscandoHabitaciones, setBuscandoHabitaciones] = useState(false);
  const [busquedaError, setBusquedaError] = useState<string | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!hotelId) return;
    fetch(`${API_URL}/publico/hoteles/${hotelId}/cotizaciones-whatsapp/info`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message ?? 'No se pudo cargar el formulario');
        return body as InfoHotel;
      })
      .then((data) => {
        setInfo(data);
        setHoraIngreso(data.horaCheckin);
        setHoraSalida(data.horaCheckout);
      })
      .catch((err) => setInfoError(err instanceof Error ? err.message : 'No se pudo cargar el formulario'));
  }, [hotelId]);

  // Grupos dentro del umbral configurado ven la lista de habitaciones reales
  // y reservan directo; grupos más grandes siguen yendo por el flujo viejo
  // de cotización con revisión humana (ver handleSubmitCotizar más abajo).
  const personasDentroDelUmbral = !!info && personas > 0 && personas <= info.umbralGrupoGrande;

  const capacidadSeleccionada = [...(habitacionesDisponibles ?? []), ...otrasHabitacionesDisponibles]
    .filter((h) => seleccionadas.has(h.habitacionId))
    .reduce((acc, h) => acc + h.aforoMax, 0);

  function toggleSeleccion(habitacionId: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(habitacionId)) next.delete(habitacionId);
      else next.add(habitacionId);
      return next;
    });
  }

  // En cuanto el cliente completa fecha de entrada, fecha/hora de salida (o
  // noches) y cantidad de personas, se busca la disponibilidad real -- ver
  // CLAUDE.md, agente de WhatsApp: "Vamos a hacer un cambio en este
  // formulario...". Debounce igual que el resto del sistema (300ms) para no
  // mandar una consulta por cada tecla mientras escriben la cantidad.
  useEffect(() => {
    if (!hotelId || !personasDentroDelUmbral) {
      setHabitacionesDisponibles(null);
      setOtrasHabitacionesDisponibles([]);
      setMostrarOtrasHabitaciones(false);
      setSeleccionadas(new Set());
      return;
    }
    if (!fechaIngreso || !horaIngreso) return;
    if (cambiarSalida ? !fechaSalida : noches < 1) return;

    const t = setTimeout(() => {
      setBuscandoHabitaciones(true);
      setBusquedaError(null);
      fetch(`${API_URL}/publico/hoteles/${hotelId}/cotizaciones-whatsapp/habitaciones-disponibles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fechaIngreso,
          horaIngreso,
          noches,
          personas,
          fechaSalida: cambiarSalida ? fechaSalida : undefined,
          horaSalida: cambiarSalida ? horaSalida : undefined,
        }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.message ?? 'No se pudo buscar habitaciones disponibles');
          return body as { habitaciones: HabitacionDisponible[]; otrasHabitaciones: HabitacionDisponible[] };
        })
        .then((data) => {
          setHabitacionesDisponibles(data.habitaciones);
          setOtrasHabitacionesDisponibles(data.otrasHabitaciones ?? []);
          setMostrarOtrasHabitaciones(false);
          setSeleccionadas(new Set());
        })
        .catch((err) => {
          setHabitacionesDisponibles(null);
          setOtrasHabitacionesDisponibles([]);
          setBusquedaError(err instanceof Error ? err.message : 'No se pudo buscar habitaciones disponibles');
        })
        .finally(() => setBuscandoHabitaciones(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, personasDentroDelUmbral, fechaIngreso, horaIngreso, noches, personas, cambiarSalida, fechaSalida, horaSalida]);

  // Fecha/hora de salida y cantidad de noches se recalculan entre sí: al
  // marcar "cambiar salida" o cambiar la fecha de llegada se recalcula la
  // salida a partir de las noches; si el cliente edita la fecha de salida
  // directamente, son las noches las que se ajustan solas.
  function cambiarFechaIngreso(valor: string) {
    setFechaIngreso(valor);
    if (cambiarSalida && valor) setFechaSalida(sumarDiasYMD(valor, noches));
  }

  // 0 es un valor "en blanco" mientras el cliente está escribiendo (ej. borró
  // el 1 para poner otro número): si clampeáramos a 1 en cada tecla, el campo
  // nunca llegaría a vaciarse y no se podría reemplazar el valor. Se corrige
  // solo a 1 recién al salir del campo (onBlur) si quedó en blanco.
  function cambiarNoches(valorTexto: string) {
    const valor = valorTexto === '' ? 0 : Math.max(1, Number(valorTexto));
    setNoches(valor);
    if (cambiarSalida && fechaIngreso && valor > 0) setFechaSalida(sumarDiasYMD(fechaIngreso, valor));
  }

  function cambiarPersonas(valorTexto: string) {
    setPersonas(valorTexto === '' ? 0 : Math.max(1, Number(valorTexto)));
  }

  function cambiarFechaSalida(valor: string) {
    setFechaSalida(valor);
    if (fechaIngreso && valor) setNoches(calcularNoches(fechaIngreso, valor));
  }

  function alternarCambiarSalida(activar: boolean) {
    setCambiarSalida(activar);
    if (activar && fechaIngreso) setFechaSalida(sumarDiasYMD(fechaIngreso, noches));
  }

  // Camino viejo: grupos por encima del umbral configurado siguen generando
  // una cotización con revisión humana (ver CotizacionPublicaService.cotizarGrupo).
  async function handleSubmitCotizar(e: FormEvent) {
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

  // Camino nuevo: grupos dentro del umbral eligen habitaciones reales con
  // checkbox y esto crea la reserva directo (no una cotización) -- ver
  // CotizacionPublicaService.crearReservaDesdeWhatsapp.
  async function handleSubmitReservar(e: FormEvent) {
    e.preventDefault();
    if (!hotelId) return;
    if (capacidadSeleccionada < personas) {
      setError('Selecciona habitaciones hasta cubrir la cantidad de personas.');
      return;
    }
    setEnviando(true);
    setError(null);
    setResultado(null);
    try {
      const res = await fetch(`${API_URL}/publico/hoteles/${hotelId}/cotizaciones-whatsapp/reservas`, {
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
          habitacionIds: [...seleccionadas],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message ?? 'No se pudo crear la reserva');
      }
      setResultado({ modo: 'reserva', id: body.id, importe_final: body.importe_final, moneda: body.moneda });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva');
    } finally {
      setEnviando(false);
    }
  }

  // Enter en cualquier campo del formulario mueve el foco al siguiente
  // campo, igual que Tab, en vez de mandar el formulario a medio llenar
  // (comportamiento por defecto del navegador al presionar Enter dentro de
  // un <input> de un <form>). Se recorren los campos enfocables en el
  // orden real del DOM, así que respeta lo que esté visible en ese
  // momento (ej. RUC/Razón social solo aparecen si "facturable" está
  // marcado). Los checkboxes y el botón de enviar se dejan con su
  // comportamiento normal.
  function manejarEnterComoTab(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    const objetivo = e.target as HTMLElement;
    if (objetivo instanceof HTMLInputElement && objetivo.type === 'checkbox') return;
    if (objetivo.tagName !== 'INPUT' && objetivo.tagName !== 'SELECT') return;

    const enfocables = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('input, select, textarea, button[type="submit"]'),
    ).filter((el) => !el.hasAttribute('disabled'));
    const indice = enfocables.indexOf(objetivo);
    if (indice === -1) return;

    e.preventDefault();
    enfocables[indice + 1]?.focus();
  }

  if (!hotelId) return null;

  if (infoError) {
    return (
      <Contenedor>
        <h1 style={tituloStyle}>No disponible</h1>
        <p style={{ fontSize: 14 }}>{infoError}</p>
      </Contenedor>
    );
  }

  if (!info) {
    return (
      <Contenedor>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Cargando...</p>
      </Contenedor>
    );
  }

  if (!info.agenteActivo) {
    return (
      <Contenedor>
        <h1 style={tituloStyle}>Cotizaciones no disponibles</h1>
        <p style={{ fontSize: 14 }}>
          Por el momento este hotel no está aceptando cotizaciones automáticas. Escríbenos directamente por
          WhatsApp y te ayudamos.
        </p>
      </Contenedor>
    );
  }

  if (resultado) {
    return (
      <Contenedor>
        {resultado.modo === 'reserva' ? (
          <>
            <h1 style={tituloStyle}>¡Reserva confirmada!</h1>
            <p style={{ fontSize: 15 }}>
              Total: <b>S/. {Number(resultado.importe_final ?? 0).toFixed(2)}</b>
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Te esperamos en la fecha indicada. Si tienes alguna duda, escríbenos por el mismo WhatsApp.
            </p>
          </>
        ) : resultado.disponible ? (
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
      <form
        onSubmit={personasDentroDelUmbral ? handleSubmitReservar : handleSubmitCotizar}
        onKeyDown={manejarEnterComoTab}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
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
              onChange={(e) => cambiarFechaIngreso(e.target.value)}
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
              value={personas === 0 ? '' : personas}
              onChange={(e) => cambiarPersonas(e.target.value)}
              onBlur={() => setPersonas((p) => Math.max(1, p))}
              style={inputStyle}
              required
            />
          </Campo>
          <Campo label="Cantidad de noches">
            <input
              type="number"
              min={1}
              value={noches === 0 ? '' : noches}
              onChange={(e) => cambiarNoches(e.target.value)}
              onBlur={() => cambiarNoches(String(Math.max(1, noches)))}
              style={inputStyle}
              required
            />
          </Campo>
        </div>

        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={cambiarSalida} onChange={(e) => alternarCambiarSalida(e.target.checked)} />
          Quiero elegir la fecha/hora de salida (por defecto sale a las {info.horaCheckout} del día calculado por
          las noches)
        </label>
        {cambiarSalida && (
          <div style={filaStyle}>
            <Campo label="Fecha de salida">
              <input
                type="date"
                value={fechaSalida}
                onChange={(e) => cambiarFechaSalida(e.target.value)}
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

        {personasDentroDelUmbral && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ ...checkboxLabelStyle, fontWeight: 600 }}>Habitaciones disponibles</label>
            {buscandoHabitaciones && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Buscando disponibilidad...</p>
            )}
            {busquedaError && <p style={{ fontSize: 13, color: 'var(--danger)' }}>{busquedaError}</p>}
            {!buscandoHabitaciones &&
              !busquedaError &&
              habitacionesDisponibles?.length === 0 &&
              otrasHabitacionesDisponibles.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  No hay habitaciones disponibles para esas fechas y cantidad de personas.
                </p>
              )}
            {!buscandoHabitaciones && habitacionesDisponibles && habitacionesDisponibles.length > 0 && (
              <ListaHabitaciones
                habitaciones={habitacionesDisponibles}
                seleccionadas={seleccionadas}
                capacidadSeleccionada={capacidadSeleccionada}
                personas={personas}
                onToggle={toggleSeleccion}
              />
            )}
            {!buscandoHabitaciones && otrasHabitacionesDisponibles.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setMostrarOtrasHabitaciones((v) => !v)}
                  style={otrasOpcionesBtnStyle}
                >
                  {mostrarOtrasHabitaciones ? '▲' : '▼'} Otras opciones de habitaciones (más de {personas + 1} personas)
                </button>
                {mostrarOtrasHabitaciones && (
                  <div style={{ marginTop: 8 }}>
                    <ListaHabitaciones
                      habitaciones={otrasHabitacionesDisponibles}
                      seleccionadas={seleccionadas}
                      capacidadSeleccionada={capacidadSeleccionada}
                      personas={personas}
                      onToggle={toggleSeleccion}
                    />
                  </div>
                )}
              </div>
            )}
            {!buscandoHabitaciones &&
              ((habitacionesDisponibles?.length ?? 0) > 0 || otrasHabitacionesDisponibles.length > 0) && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Seleccionado: {capacidadSeleccionada} / {personas} personas
                </p>
              )}
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

        <button
          type="submit"
          disabled={enviando || (personasDentroDelUmbral && capacidadSeleccionada < personas)}
          style={botonStyle}
        >
          {enviando ? (personasDentroDelUmbral ? 'Reservando...' : 'Cotizando...') : personasDentroDelUmbral ? 'Reservar' : 'Cotizar'}
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

// Lista de habitaciones con checkbox, reusada tanto para la lista principal
// (acordes al tamaño del grupo) como para "Otras opciones de habitaciones"
// (bastante más grandes de lo necesario) -- mismo look, misma lógica de
// selección y de cuándo deshabilitar una fila.
function ListaHabitaciones({
  habitaciones,
  seleccionadas,
  capacidadSeleccionada,
  personas,
  onToggle,
}: {
  habitaciones: HabitacionDisponible[];
  seleccionadas: Set<string>;
  capacidadSeleccionada: number;
  personas: number;
  onToggle: (habitacionId: string) => void;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {habitaciones.map((h) => {
        const marcada = seleccionadas.has(h.habitacionId);
        const deshabilitada = !marcada && capacidadSeleccionada >= personas;
        return (
          <label
            key={h.habitacionId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              opacity: deshabilitada ? 0.5 : 1,
              cursor: deshabilitada ? 'not-allowed' : 'pointer',
            }}
          >
            <input type="checkbox" checked={marcada} disabled={deshabilitada} onChange={() => onToggle(h.habitacionId)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                Hab. {h.numero} · {h.tipo}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Máx. {h.aforoMax} personas</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>S/. {h.importe.toFixed(2)}</div>
          </label>
        );
      })}
    </div>
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

const otrasOpcionesBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--brand)',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
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
