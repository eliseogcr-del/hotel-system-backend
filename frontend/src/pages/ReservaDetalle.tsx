import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { EstadoBadge } from './Reservas';

interface Habitacion {
  id: string;
  hab_numero: number;
  tipos_habitacion: { id: string; nombre: string } | null;
}

interface LineaReserva {
  id: string;
  habitacion_id: string;
  nro_personas: number;
  tarifa_dia: number;
  dias: number;
  subtotal: number;
  tipo_alquiler: string;
  fecha_hora_checkin_prevista: string;
  fecha_hora_checkout_prevista: string;
  habitaciones: { hab_numero: number; tipos_habitacion: { nombre: string } | null } | null;
}

interface ReservaDetalle {
  id: string;
  origen: string;
  estado: string;
  moneda: string;
  descuento_total: number;
  importe_final: number | null;
  huespedes: { nombres: string; apellidos: string; nro_doc: string } | null;
  empresas: { razon_social: string } | null;
  reserva_habitacion: LineaReserva[];
}

export function ReservaDetalle() {
  const { id } = useParams<{ id: string }>();
  const { hotelActual } = useHotel();
  const navigate = useNavigate();
  const [haciendoCheckin, setHaciendoCheckin] = useState<string | null>(null);
  const [reserva, setReserva] = useState<ReservaDetalle | null>(null);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);
  const [mostrarAgregar, setMostrarAgregar] = useState(false);
  const [trasladando, setTrasladando] = useState<LineaReserva | null>(null);

  function cargar() {
    if (!hotelActual || !id) return;
    api
      .get<ReservaDetalle>(`/hoteles/${hotelActual.hotelId}/reservas/${id}`)
      .then(setReserva)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'));
  }

  useEffect(cargar, [hotelActual, id]);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch(() => {});
  }, [hotelActual]);

  async function confirmar() {
    if (!hotelActual || !id) return;
    setAccionando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/reservas/${id}/confirmar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo confirmar');
    } finally {
      setAccionando(false);
    }
  }

  async function cancelar() {
    if (!hotelActual || !id) return;
    setAccionando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/reservas/${id}/cancelar`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cancelar');
    } finally {
      setAccionando(false);
    }
  }

  async function hacerCheckin(reservaHabitacionId: string) {
    if (!hotelActual) return;
    setHaciendoCheckin(reservaHabitacionId);
    setError(null);
    try {
      const estadia = await api.post<{ id: string }>(`/hoteles/${hotelActual.hotelId}/estadias/checkin`, {
        reservaHabitacionId,
      });
      navigate(`/estadias/${estadia.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo hacer el check-in');
    } finally {
      setHaciendoCheckin(null);
    }
  }

  if (!hotelActual) return null;
  if (error && !reserva) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!reserva) return <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>;

  return (
    <div>
      <Link to="/reservas" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        ← Volver a reservas
      </Link>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 20px' }}>
        <div>
          <h1 style={{ fontSize: 20 }}>
            {reserva.huespedes ? `${reserva.huespedes.nombres} ${reserva.huespedes.apellidos}` : reserva.empresas?.razon_social}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {reserva.origen} · {reserva.huespedes?.nro_doc}
          </p>
        </div>
        <EstadoBadge estado={reserva.estado} />
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {reserva.estado === 'pendiente_revision' && (
          <button onClick={confirmar} disabled={accionando} style={btnPrimary}>
            Confirmar reserva
          </button>
        )}
        {reserva.estado !== 'cancelada' && (
          <button onClick={cancelar} disabled={accionando} style={btnDanger}>
            Cancelar reserva
          </button>
        )}
        {reserva.estado !== 'cancelada' && (
          <button onClick={() => setMostrarAgregar((v) => !v)} style={btnSecondary}>
            {mostrarAgregar ? 'Cerrar' : '+ Agregar habitación'}
          </button>
        )}
      </div>

      {mostrarAgregar && (
        <AgregarHabitacionForm
          hotelId={hotelActual.hotelId}
          reservaId={reserva.id}
          habitaciones={habitaciones}
          onAgregada={() => {
            setMostrarAgregar(false);
            cargar();
          }}
        />
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
              <th style={thStyle}>Habitación</th>
              <th style={thStyle}>Check-in</th>
              <th style={thStyle}>Check-out</th>
              <th style={thStyle}>Personas</th>
              <th style={thStyle}>Tarifa/día</th>
              <th style={thStyle}>Días</th>
              <th style={thStyle}>Subtotal</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {reserva.reserva_habitacion.map((l) => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdStyle}>
                  {l.habitaciones?.hab_numero} · {l.habitaciones?.tipos_habitacion?.nombre}
                </td>
                <td style={tdStyle}>{new Date(l.fecha_hora_checkin_prevista).toLocaleString()}</td>
                <td style={tdStyle}>{new Date(l.fecha_hora_checkout_prevista).toLocaleString()}</td>
                <td style={tdStyle}>{l.nro_personas}</td>
                <td style={tdStyle}>{l.tarifa_dia}</td>
                <td style={tdStyle}>{l.dias}</td>
                <td style={tdStyle}>{l.subtotal}</td>
                <td style={{ ...tdStyle, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {reserva.estado === 'confirmada' && (
                    <button
                      onClick={() => hacerCheckin(l.id)}
                      disabled={haciendoCheckin === l.id}
                      style={btnSecondary}
                    >
                      {haciendoCheckin === l.id ? 'Procesando...' : 'Check-in'}
                    </button>
                  )}
                  {reserva.estado !== 'cancelada' && (
                    <button onClick={() => setTrasladando(l)} style={btnSecondary}>
                      Trasladar reserva
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reserva.reserva_habitacion.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          Esta reserva todavía no tiene ninguna habitación asignada.
        </p>
      )}

      <p style={{ textAlign: 'right', fontWeight: 500, fontSize: 15, marginTop: 12 }}>
        Total: {reserva.moneda} {reserva.importe_final ?? 0}
      </p>

      {trasladando && (
        <TrasladarHabitacionModal
          hotelId={hotelActual.hotelId}
          reservaId={reserva.id}
          linea={trasladando}
          onClose={() => setTrasladando(null)}
          onTrasladado={() => {
            setTrasladando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function AgregarHabitacionForm({
  hotelId,
  reservaId,
  habitaciones,
  onAgregada,
}: {
  hotelId: string;
  reservaId: string;
  habitaciones: Habitacion[];
  onAgregada: () => void;
}) {
  const [habitacionId, setHabitacionId] = useState('');
  const [nroPersonas, setNroPersonas] = useState(2);
  const [tipoAlquiler, setTipoAlquiler] = useState<'pernocte' | 'por_horas'>('pernocte');
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/reservas/${reservaId}/habitaciones`, {
        habitacionId,
        nroPersonas,
        tipoAlquiler,
        checkinPrevisto: new Date(checkin).toISOString(),
        checkoutPrevisto: new Date(checkout).toISOString(),
      });
      onAgregada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar la habitación');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--form-bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={labelStyle}>Habitación</label>
        <select value={habitacionId} onChange={(e) => setHabitacionId(e.target.value)} style={inputStyle} required>
          <option value="">Selecciona...</option>
          {habitaciones.map((h) => (
            <option key={h.id} value={h.id}>
              {h.hab_numero} · {h.tipos_habitacion?.nombre}
            </option>
          ))}
        </select>
      </div>
      <div style={{ width: 90 }}>
        <label style={labelStyle}># personas</label>
        <input type="number" min={1} value={nroPersonas} onChange={(e) => setNroPersonas(Number(e.target.value))} style={inputStyle} />
      </div>
      <div style={{ width: 130 }}>
        <label style={labelStyle}>Tipo</label>
        <select value={tipoAlquiler} onChange={(e) => setTipoAlquiler(e.target.value as 'pernocte' | 'por_horas')} style={inputStyle}>
          <option value="pernocte">Pernocte</option>
          <option value="por_horas">Por horas</option>
        </select>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={labelStyle}>Check-in</label>
        <input type="datetime-local" value={checkin} onChange={(e) => setCheckin(e.target.value)} style={inputStyle} required />
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={labelStyle}>Check-out</label>
        <input type="datetime-local" value={checkout} onChange={(e) => setCheckout(e.target.value)} style={inputStyle} required />
      </div>
      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Agregando...' : 'Agregar'}
      </button>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, width: '100%' }}>{error}</p>}
    </form>
  );
}

function TrasladarHabitacionModal({
  hotelId,
  reservaId,
  linea,
  onClose,
  onTrasladado,
}: {
  hotelId: string;
  reservaId: string;
  linea: LineaReserva;
  onClose: () => void;
  onTrasladado: () => void;
}) {
  const [nuevaHabitacionId, setNuevaHabitacionId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [opciones, setOpciones] = useState<Habitacion[] | null>(null);

  useEffect(() => {
    api
      .get<Habitacion[]>(`/hoteles/${hotelId}/reservas/${reservaId}/habitaciones/${linea.id}/disponibles-traslado`)
      .then(setOpciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar las habitaciones disponibles'));
  }, [hotelId, reservaId, linea.id]);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!nuevaHabitacionId) return;
    setEnviando(true);
    setError(null);
    try {
      const resultado = await api.patch<{ avisoTipoHabitacion: string | null }>(
        `/hoteles/${hotelId}/reservas/${reservaId}/habitaciones/${linea.id}/trasladar`,
        { nuevaHabitacionId },
      );
      if (resultado.avisoTipoHabitacion) {
        setAviso(resultado.avisoTipoHabitacion);
      } else {
        onTrasladado();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo trasladar la habitación');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 440 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>Trasladar reserva</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Habitación actual: {linea.habitaciones?.hab_numero}. Se mantienen las mismas fechas de check-in y
          check-out; solo cambia la habitación. Abajo solo aparecen las habitaciones libres para esas fechas.
        </p>

        {aviso ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--limpieza-text)', background: 'var(--limpieza-bg)', border: '1px solid var(--limpieza)', borderRadius: 'var(--radius)', padding: 10, marginBottom: 16 }}>
              {aviso}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onTrasladado} style={btnPrimary}>
                Entendido
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={confirmar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
            <div>
              <label style={labelStyle}>Nueva habitación</label>
              <select
                value={nuevaHabitacionId}
                onChange={(e) => setNuevaHabitacionId(e.target.value)}
                style={inputStyle}
                required
                disabled={!opciones}
              >
                <option value="">
                  {!opciones ? 'Cargando habitaciones disponibles...' : 'Selecciona una habitación...'}
                </option>
                {opciones?.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.hab_numero}
                    {h.tipos_habitacion ? ` · ${h.tipos_habitacion.nombre}` : ''}
                  </option>
                ))}
              </select>
              {opciones?.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  No hay ninguna otra habitación libre para esas fechas.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={onClose} style={btnSecondary}>
                Cancelar
              </button>
              <button type="submit" disabled={enviando || !nuevaHabitacionId} style={btnPrimary}>
                {enviando ? 'Trasladando...' : 'Confirmar traslado'}
              </button>
            </div>
          </form>
        )}
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

const thStyle: CSSProperties = { padding: '6px 8px' };
const tdStyle: CSSProperties = { padding: '8px', color: 'var(--text-secondary)' };

const inputStyle: CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-1)',
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
};

const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const btnDanger: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--danger)',
  border: '1px solid var(--ocupada)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};
