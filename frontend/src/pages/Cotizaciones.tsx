import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { buscarHuespedPorDni, crearHuesped } from '../lib/huespedes';
import { EstadoBadge } from './Reservas';

interface Habitacion {
  id: string;
  hab_numero: number;
  tipos_habitacion: { nombre: string } | null;
}

interface Cotizacion {
  id: string;
  fecha_desde: string;
  fecha_hasta: string;
  estado: string;
  total_estimado: number | null;
  moneda: string;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
}

const ESTADOS = ['pendiente', 'aprobada', 'convertida', 'vencida', 'cancelada'];

export function Cotizaciones() {
  const { hotelActual } = useHotel();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    const query = filtroEstado ? `?estado=${filtroEstado}` : '';
    api
      .get<Cotizacion[]>(`/hoteles/${hotelActual.hotelId}/cotizaciones${query}`)
      .then(setCotizaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, [hotelActual, filtroEstado]);

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Cotizaciones</h1>
        <button style={btnPrimary} onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Nueva cotización'}
        </button>
      </div>

      {mostrarForm && (
        <NuevaCotizacionForm
          hotelId={hotelActual.hotelId}
          habitaciones={habitaciones}
          onCreada={() => {
            setMostrarForm(false);
            cargar();
          }}
        />
      )}

      <select
        value={filtroEstado}
        onChange={(e) => setFiltroEstado(e.target.value)}
        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, margin: '16px 0' }}
      >
        <option value="">Todos los estados</option>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cotizaciones.map((c) => (
            <Link
              key={c.id}
              to={`/cotizaciones/${c.id}`}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '4px 12px',
                padding: '10px 14px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                textDecoration: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            >
              <span>{c.huespedes ? `${c.huespedes.nombres} ${c.huespedes.apellidos}` : c.empresas?.razon_social ?? '—'}</span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {new Date(c.fecha_desde).toLocaleDateString()} → {new Date(c.fecha_hasta).toLocaleDateString()}
              </span>
              <span style={{ fontWeight: 500 }}>{c.moneda} {c.total_estimado ?? 0}</span>
              <EstadoBadge estado={c.estado} />
            </Link>
          ))}
          {cotizaciones.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No hay cotizaciones.</p>}
        </div>
      )}
    </div>
  );
}

function NuevaCotizacionForm({
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
  const [habitacionId, setHabitacionId] = useState('');
  const [nroPersonas, setNroPersonas] = useState(2);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
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

      await api.post(`/hoteles/${hotelId}/cotizaciones`, {
        huespedId: idHuesped,
        fechaDesde,
        fechaHasta,
        habitaciones: [{ habitacionId, nroPersonas }],
      });
      onCreada();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cotización');
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
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Nombres (huésped nuevo)</label>
              <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Apellidos</label>
              <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={labelStyle}>Desde</label>
          <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} style={inputStyle} required />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={labelStyle}>Hasta</label>
          <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} style={inputStyle} required />
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Creando...' : 'Crear cotización'}
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
