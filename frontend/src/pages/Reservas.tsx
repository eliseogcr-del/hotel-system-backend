import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { buscarHuespedPorDni, crearHuesped } from '../lib/huespedes';

interface Habitacion {
  id: string;
  hab_numero: number;
  tipos_habitacion: { nombre: string } | null;
}

interface Reserva {
  id: string;
  origen: string;
  fecha_ingreso: string;
  dias_hospedaje: number;
  estado: string;
  importe_final: number | null;
  moneda: string;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
}

const ESTADOS = ['pendiente_revision', 'confirmada', 'cancelada'];
const ORIGENES = ['telefono', 'whatsapp', 'booking', 'airbnb', 'directo', 'walkin'];

export function Reservas() {
  const { hotelActual } = useHotel();
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  function cargarReservas() {
    if (!hotelActual) return;
    setLoading(true);
    const query = filtroEstado ? `?estado=${filtroEstado}` : '';
    api
      .get<Reserva[]>(`/hoteles/${hotelActual.hotelId}/reservas${query}`)
      .then(setReservas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargarReservas, [hotelActual, filtroEstado]);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch(() => {});
  }, [hotelActual]);

  if (!hotelActual) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Reservas</h1>
        <button style={btnPrimary} onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Nueva reserva'}
        </button>
      </div>

      {mostrarForm && (
        <NuevaReservaForm
          hotelId={hotelActual.hotelId}
          habitaciones={habitaciones}
          onCreada={() => {
            setMostrarForm(false);
            cargarReservas();
          }}
        />
      )}

      <div style={{ margin: '16px 0' }}>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={selectStyle}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reservas.map((r) => (
            <Link
              key={r.id}
              to={`/reservas/${r.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                textDecoration: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <span>
                {r.huespedes ? `${r.huespedes.nombres} ${r.huespedes.apellidos}` : r.empresas?.razon_social ?? '—'}
                {' · '}
                <span style={{ color: 'var(--text-muted)' }}>{r.origen}</span>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {new Date(r.fecha_ingreso).toLocaleDateString()} · {r.dias_hospedaje}d
              </span>
              <span style={{ fontWeight: 500 }}>
                {r.importe_final != null ? `${r.moneda} ${r.importe_final}` : '—'}
              </span>
              <EstadoBadge estado={r.estado} />
            </Link>
          ))}
          {reservas.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay reservas.</p>}
        </div>
      )}
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: string }) {
  const colores: Record<string, { bg: string; text: string }> = {
    pendiente_revision: { bg: 'var(--limpieza-bg)', text: 'var(--limpieza-text)' },
    confirmada: { bg: 'var(--disponible-bg)', text: 'var(--disponible-text)' },
    cancelada: { bg: 'var(--ocupada-bg)', text: 'var(--ocupada-text)' },
  };
  const c = colores[estado] ?? { bg: 'var(--surface-1)', text: 'var(--text-secondary)' };
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 999,
      }}
    >
      {estado}
    </span>
  );
}

function NuevaReservaForm({
  hotelId,
  habitaciones,
  onCreada,
}: {
  hotelId: string;
  habitaciones: Habitacion[];
  onCreada: () => void;
}) {
  const [dni, setDni] = useState('');
  const [huespedId, setHuespedId] = useState<string | null>(null);
  const [huespedNombre, setHuespedNombre] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [origen, setOrigen] = useState('directo');
  const [habitacionId, setHabitacionId] = useState('');
  const [nroPersonas, setNroPersonas] = useState(2);
  const [tipoAlquiler, setTipoAlquiler] = useState<'pernocte' | 'por_horas'>('pernocte');
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    if (!dni) return;
    setBuscando(true);
    setError(null);
    try {
      const h = await buscarHuespedPorDni(hotelId, dni);
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
      setBuscando(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      let idHuesped = huespedId;
      if (!idHuesped) {
        if (!nombres || !apellidos || !dni) {
          throw new Error('Completa nombres, apellidos y DNI para crear al huésped');
        }
        const creado = await crearHuesped(hotelId, { nombres, apellidos, tipoDoc: 'dni', nroDoc: dni });
        idHuesped = creado.id;
      }

      await api.post(`/hoteles/${hotelId}/reservas`, {
        huespedId: idHuesped,
        origen,
        habitaciones: [
          {
            habitacionId,
            nroPersonas,
            tipoAlquiler,
            checkinPrevisto: new Date(checkin).toISOString(),
            checkoutPrevisto: new Date(checkout).toISOString(),
          },
        ],
      });
      onCreada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la reserva');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>DNI del huésped</label>
          <input value={dni} onChange={(e) => setDni(e.target.value)} style={inputStyle} required />
        </div>
        <button type="button" onClick={buscar} disabled={buscando} style={btnSecondary}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {huespedId ? (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Huésped encontrado: {huespedNombre}</p>
      ) : (
        dni && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Nombres (huésped nuevo)</label>
              <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Apellidos</label>
              <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Origen</label>
          <select value={origen} onChange={(e) => setOrigen(e.target.value)} style={selectStyle}>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Habitación</label>
          <select value={habitacionId} onChange={(e) => setHabitacionId(e.target.value)} style={selectStyle} required>
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
          <input
            type="number"
            min={1}
            value={nroPersonas}
            onChange={(e) => setNroPersonas(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
        <div style={{ width: 130 }}>
          <label style={labelStyle}>Tipo</label>
          <select value={tipoAlquiler} onChange={(e) => setTipoAlquiler(e.target.value as 'pernocte' | 'por_horas')} style={selectStyle}>
            <option value="pernocte">Pernocte</option>
            <option value="por_horas">Por horas</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Check-in</label>
          <input type="datetime-local" value={checkin} onChange={(e) => setCheckin(e.target.value)} style={inputStyle} required />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Check-out</label>
          <input type="datetime-local" value={checkout} onChange={(e) => setCheckout(e.target.value)} style={inputStyle} required />
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Creando...' : 'Crear reserva'}
      </button>
    </form>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

const selectStyle: CSSProperties = { ...inputStyle };

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
