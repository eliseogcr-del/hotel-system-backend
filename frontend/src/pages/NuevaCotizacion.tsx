import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { buscarHuespedPorDni, crearHuesped } from '../lib/huespedes';

interface HabitacionDisponible {
  id: string;
  hab_numero: number;
  piso: number;
  tipos_habitacion: { nombre: string; aforo_max: number } | null;
}

interface RespuestaDisponibilidad {
  checkinPrevisto: string;
  checkoutPrevisto: string;
  dias: number;
  habitaciones: HabitacionDisponible[];
}

interface FilaGrid {
  habitacionId: string;
  habNumero: number;
  piso: number;
  tipoNombre: string | null;
  aforoMax: number;
  nota: string;
  personas: number;
  precioPersona: number;
}

function hoyYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NuevaCotizacion() {
  const { hotelActual } = useHotel();
  const navigate = useNavigate();

  // Cliente
  const [dni, setDni] = useState('');
  const [huespedId, setHuespedId] = useState<string | null>(null);
  const [huespedNombre, setHuespedNombre] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  // Fechas/horas
  const [fechaCheckin, setFechaCheckin] = useState(hoyYMD());
  const [horaCheckin, setHoraCheckin] = useState('15:00');
  const [noches, setNoches] = useState(1);
  const [horaCheckout, setHoraCheckout] = useState('11:00');

  const [disponibilidad, setDisponibilidad] = useState<RespuestaDisponibilidad | null>(null);
  const [filas, setFilas] = useState<FilaGrid[]>([]);
  const [buscandoDisponibilidad, setBuscandoDisponibilidad] = useState(false);
  const [errorDisponibilidad, setErrorDisponibilidad] = useState<string | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<{ hora_checkin: string; hora_checkout: string }>(`/hoteles/${hotelActual.hotelId}`)
      .then((h) => {
        if (h.hora_checkin) setHoraCheckin(h.hora_checkin.slice(0, 5));
        if (h.hora_checkout) setHoraCheckout(h.hora_checkout.slice(0, 5));
      })
      .catch(() => {});
  }, [hotelActual]);

  async function buscarCliente() {
    if (!hotelActual || !dni) return;
    setBuscandoCliente(true);
    setError(null);
    try {
      const h = await buscarHuespedPorDni(hotelActual.hotelId, dni);
      if (h) {
        setHuespedId(h.id);
        setHuespedNombre(`${h.nombres} ${h.apellidos}`);
      } else {
        setHuespedId(null);
        setHuespedNombre('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar huésped');
    } finally {
      setBuscandoCliente(false);
    }
  }

  async function buscarDisponibilidad() {
    if (!hotelActual) return;
    setBuscandoDisponibilidad(true);
    setErrorDisponibilidad(null);
    setDisponibilidad(null);
    try {
      const resultado = await api.post<RespuestaDisponibilidad>(
        `/hoteles/${hotelActual.hotelId}/cotizaciones/habitaciones-disponibles`,
        { fechaCheckin, horaCheckin, noches, horaCheckout },
      );
      setDisponibilidad(resultado);
      setFilas(
        resultado.habitaciones.map((h) => ({
          habitacionId: h.id,
          habNumero: h.hab_numero,
          piso: h.piso,
          tipoNombre: h.tipos_habitacion?.nombre ?? null,
          aforoMax: h.tipos_habitacion?.aforo_max ?? 0,
          nota: '',
          personas: 0,
          precioPersona: 0,
        })),
      );
    } catch (err) {
      setErrorDisponibilidad(err instanceof ApiError ? err.message : 'No se pudo consultar disponibilidad');
    } finally {
      setBuscandoDisponibilidad(false);
    }
  }

  function actualizarFila(habitacionId: string, cambios: Partial<FilaGrid>) {
    setFilas((prev) => prev.map((f) => (f.habitacionId === habitacionId ? { ...f, ...cambios } : f)));
  }

  function quitarFila(habitacionId: string) {
    setFilas((prev) => prev.filter((f) => f.habitacionId !== habitacionId));
  }

  const totalPersonas = useMemo(() => filas.reduce((acc, f) => acc + (Number(f.personas) || 0), 0), [filas]);
  const aforoMaxTotal = useMemo(() => filas.reduce((acc, f) => acc + (Number(f.aforoMax) || 0), 0), [filas]);
  const totalGeneral = useMemo(
    () => filas.reduce((acc, f) => acc + subtotalFila(f, disponibilidad?.dias ?? noches), 0),
    [filas, disponibilidad, noches],
  );
  const filasIncluidas = useMemo(() => filas.filter((f) => Number(f.personas) > 0), [filas]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!hotelActual) return;
    setError(null);

    let idHuesped = huespedId;
    if (!idHuesped) {
      if (!nombres.trim() || !apellidos.trim() || !dni.trim()) {
        setError('Busca al huésped por DNI, o completa nombres, apellidos y DNI para registrarlo.');
        return;
      }
    }
    if (filasIncluidas.length === 0) {
      setError('Ingresa la cantidad de personas de al menos una habitación para poder grabar la cotización.');
      return;
    }

    setGuardando(true);
    try {
      if (!idHuesped) {
        const creado = await crearHuesped(hotelActual.hotelId, {
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          tipoDoc: 'dni',
          nroDoc: dni.trim(),
        });
        idHuesped = creado.id;
      }

      const resultado = await api.post<{ id: string }>(`/hoteles/${hotelActual.hotelId}/cotizaciones`, {
        huespedId: idHuesped,
        fechaDesde: fechaCheckin,
        fechaHasta: fechaCheckoutYMD(fechaCheckin, disponibilidad?.dias ?? noches),
        horaCheckin,
        horaCheckout,
        habitaciones: filasIncluidas.map((f) => ({
          habitacionId: f.habitacionId,
          nroPersonas: f.personas,
          precioPersona: f.precioPersona,
          notas: f.nota.trim() || undefined,
        })),
      });
      navigate(`/cotizaciones/${resultado.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo grabar la cotización');
    } finally {
      setGuardando(false);
    }
  }

  if (!hotelActual) return null;

  return (
    <div>
      <Link to="/cotizaciones" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        ← Volver a cotizaciones
      </Link>

      <h1 style={{ fontSize: 20, margin: '12px 0 20px' }}>Nueva cotización</h1>

      <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={cardStyle}>
          <p style={cardTitleStyle}>Cliente</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>DNI del huésped</label>
              <input
                value={dni}
                onChange={(e) => {
                  setDni(e.target.value);
                  setHuespedId(null);
                  setHuespedNombre('');
                }}
                style={inputStyle}
              />
            </div>
            <button type="button" onClick={buscarCliente} disabled={buscandoCliente || !dni} style={btnSecondary}>
              {buscandoCliente ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
          {huespedId ? (
            <p style={{ fontSize: 12, color: 'var(--disponible)', margin: '8px 0 0' }}>
              Huésped encontrado: {huespedNombre}
            </p>
          ) : (
            dni && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', margin: 0 }}>
                  No se encontró ningún huésped con ese DNI -- completa los datos para registrarlo.
                </p>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Nombres</label>
                  <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Apellidos</label>
                  <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} />
                </div>
              </div>
            )
          )}
        </div>

        <div style={cardStyle}>
          <p style={cardTitleStyle}>Fecha y horario probable</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ minWidth: 150 }}>
              <label style={labelStyle}>Fecha de check-in</label>
              <input
                type="date"
                value={fechaCheckin}
                onChange={(e) => setFechaCheckin(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ width: 110 }}>
              <label style={labelStyle}>Hora check-in</label>
              <input
                type="time"
                value={horaCheckin}
                onChange={(e) => setHoraCheckin(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ width: 90 }}>
              <label style={labelStyle}>Noches</label>
              <input
                type="number"
                min={1}
                value={noches}
                onChange={(e) => setNoches(Math.max(1, Number(e.target.value)))}
                style={inputStyle}
                required
              />
            </div>
            <div style={{ width: 110 }}>
              <label style={labelStyle}>Hora check-out</label>
              <input
                type="time"
                value={horaCheckout}
                onChange={(e) => setHoraCheckout(e.target.value)}
                style={inputStyle}
                required
              />
            </div>
            <button type="button" onClick={buscarDisponibilidad} disabled={buscandoDisponibilidad} style={btnPrimary}>
              {buscandoDisponibilidad ? 'Buscando...' : 'Buscar habitaciones disponibles'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0' }}>
            Solo se listarán las habitaciones que quedan libres en ese rango, dejando el margen de limpieza mínimo
            entre estadías (según el tipo de habitación).
          </p>
        </div>

        {errorDisponibilidad && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{errorDisponibilidad}</p>}

        {disponibilidad && (
          <div style={cardStyle}>
            <p style={cardTitleStyle}>Habitaciones disponibles</p>
            {filas.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                No hay ninguna habitación disponible para ese rango de fechas.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 10px' }}>
                  Completa cantidad de personas y precio por persona/noche solo en las habitaciones que quieras
                  cotizar -- las que dejes en 0 personas no se incluyen.
                </p>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px 28px',
                    alignItems: 'center',
                    fontWeight: 700,
                    fontSize: 14,
                    color: 'var(--table-header-text)',
                    background: 'var(--table-header-bg)',
                    border: '1px solid var(--table-header-border)',
                    borderRadius: 'var(--radius)',
                    padding: '10px 14px',
                    marginBottom: 12,
                  }}
                >
                  <span>Total personas: {totalPersonas}</span>
                  <span>Capacidad máxima: {aforoMaxTotal}</span>
                  <span>Total cotizado: PEN {totalGeneral.toFixed(2)}</span>
                </div>

                <div
                  style={{
                    overflowX: 'auto',
                    border: `2px solid var(--table-header-border)`,
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed', minWidth: 720 }}>
                    <colgroup>
                      <col style={{ width: 90 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 130 }} />
                      <col style={{ width: 110 }} />
                      <col style={{ width: 190 }} />
                      <col style={{ width: 80 }} />
                    </colgroup>
                    <thead>
                      <tr style={{ textAlign: 'left', fontSize: 11.5 }}>
                        <th style={thStyle}>Habitación</th>
                        <th style={thStyle}>Tipo</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Personas</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Precio/persona/noche</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Subtotal</th>
                        <th style={thStyle}>Nota</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, i) => (
                        <tr key={f.habitacionId} style={{ background: i % 2 === 1 ? 'var(--surface-0)' : 'var(--surface-1)' }}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>{f.habNumero}</td>
                          <td style={tdStyle}>{f.tipoNombre ?? '—'}</td>
                          <td style={tdStyle}>
                            <input
                              type="number"
                              min={0}
                              value={f.personas}
                              onChange={(e) =>
                                actualizarFila(f.habitacionId, { personas: Math.max(0, Number(e.target.value)) })
                              }
                              style={{ ...inputCeldaStyle, textAlign: 'right' }}
                            />
                          </td>
                          <td style={tdStyle}>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={f.precioPersona}
                              onChange={(e) =>
                                actualizarFila(f.habitacionId, { precioPersona: Math.max(0, Number(e.target.value)) })
                              }
                              style={{ ...inputCeldaStyle, textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                            {subtotalFila(f, disponibilidad.dias).toFixed(2)}
                          </td>
                          <td style={tdStyle}>
                            <input
                              value={f.nota}
                              onChange={(e) => actualizarFila(f.habitacionId, { nota: e.target.value })}
                              placeholder="Opcional"
                              style={inputCeldaStyle}
                            />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button type="button" onClick={() => quitarFila(f.habitacionId)} style={btnQuitar}>
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

        <div>
          <button type="submit" disabled={guardando || !disponibilidad} style={btnPrimary}>
            {guardando ? 'Grabando...' : 'Grabar cotización'}
          </button>
        </div>
      </form>
    </div>
  );
}

function subtotalFila(f: FilaGrid, dias: number): number {
  return (Number(f.personas) || 0) * (Number(f.precioPersona) || 0) * dias;
}

function fechaCheckoutYMD(fechaCheckin: string, noches: number): string {
  const [anio, mes, dia] = fechaCheckin.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + noches);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 16,
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

const thStyle: CSSProperties = {
  padding: '8px 8px',
  fontWeight: 700,
  color: 'var(--table-header-text)',
  background: 'var(--table-header-bg)',
  borderRight: '2px solid var(--table-header-border)',
  borderBottom: '2px solid var(--table-header-border)',
};

const tdStyle: CSSProperties = {
  padding: '4px 6px',
  color: 'var(--text-secondary)',
  borderRight: '2px solid var(--table-border)',
  borderBottom: '2px solid var(--table-border)',
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

const inputCeldaStyle: CSSProperties = {
  ...inputStyle,
  padding: '4px 6px',
  fontSize: 12.5,
  background: 'transparent',
  border: '1px solid transparent',
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
  cursor: 'pointer',
};

const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  cursor: 'pointer',
};

const btnQuitar: CSSProperties = {
  padding: '4px 8px',
  background: 'transparent',
  border: '1px solid var(--danger)',
  borderRadius: 'var(--radius)',
  color: 'var(--danger)',
  fontSize: 11.5,
  cursor: 'pointer',
};
