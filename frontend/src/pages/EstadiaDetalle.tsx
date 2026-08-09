import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface MovimientoCuenta {
  id: string;
  tipo: string;
  monto: number;
  metodo_pago: string | null;
  fecha: string;
  notas: string | null;
  personal: { nombre: string } | null;
}

interface EstadiaDetalleData {
  id: string;
  estado_actual: string;
  saldo: number;
  checkin_real: string | null;
  checkout_real: string | null;
  movimientos: MovimientoCuenta[];
  reserva_habitacion: {
    tarifa_dia: number;
    habitaciones: { hab_numero: number; piso: number } | null;
    reservas: { huespedes: { nombres: string; apellidos: string } | null } | null;
  };
}

const TIPOS_MOVIMIENTO = ['pago', 'consumo_bazar', 'ajuste', 'early', 'late', 'cochera'];
const METODOS = ['efectivo', 'transferencia', 'yape', 'tarjeta'];

const TIPO_LABEL: Record<string, string> = {
  alquiler: 'Alquiler',
  pago: 'Pago',
  consumo_bazar: 'Consumo de bazar',
  ajuste: 'Ajuste',
  early: 'Early (entrada temprana)',
  late: 'Late (salida tardía)',
  cochera: 'Cochera',
};

interface ProductoBazar {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean;
}

function ahoraLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function EstadiaDetalle() {
  const { id } = useParams<{ id: string }>();
  const { hotelActual } = useHotel();
  const [estadia, setEstadia] = useState<EstadiaDetalleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);
  const [mostrarCheckout, setMostrarCheckout] = useState(false);
  const [cobroLate, setCobroLate] = useState('');
  const [checkoutReal, setCheckoutReal] = useState(ahoraLocal());

  function cargar() {
    if (!hotelActual || !id) return;
    api
      .get<EstadiaDetalleData>(`/hoteles/${hotelActual.hotelId}/estadias/${id}`)
      .then(setEstadia)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'));
  }

  useEffect(cargar, [hotelActual, id]);

  async function confirmarCheckout() {
    if (!hotelActual || !id) return;
    setAccionando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/estadias/${id}/checkout`, {
        cobroLateManual: cobroLate === '' ? undefined : Number(cobroLate),
        checkoutReal: new Date(checkoutReal).toISOString(),
      });
      setMostrarCheckout(false);
      setCobroLate('');
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo hacer el checkout');
    } finally {
      setAccionando(false);
    }
  }

  if (!hotelActual) return null;
  if (error && !estadia) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!estadia) return <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>;

  const totalCargos = estadia.movimientos
    .filter((m) => Number(m.monto) > 0)
    .reduce((acc, m) => acc + Number(m.monto), 0);
  const totalPagado = Math.abs(
    estadia.movimientos.filter((m) => m.tipo === 'pago').reduce((acc, m) => acc + Number(m.monto), 0),
  );

  return (
    <div>
      <Link to="/estadias" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        ← Volver a estadías
      </Link>

      <div style={{ margin: '12px 0 20px' }}>
        <h1 style={{ fontSize: 20 }}>
          Habitación {estadia.reserva_habitacion.habitaciones?.hab_numero} ·{' '}
          {estadia.reserva_habitacion.reservas?.huespedes
            ? `${estadia.reserva_habitacion.reservas.huespedes.nombres} ${estadia.reserva_habitacion.reservas.huespedes.apellidos}`
            : '—'}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Estado: {estadia.estado_actual}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>Total cargado</p>
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>PEN {totalCargos.toFixed(2)}</p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>Pagado</p>
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--disponible)' }}>
            PEN {totalPagado.toFixed(2)}
          </p>
        </div>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>Adeudado</p>
          <p
            style={{
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
              color: estadia.saldo > 0 ? 'var(--ocupada)' : 'var(--text-primary)',
            }}
          >
            PEN {Number(estadia.saldo).toFixed(2)}
          </p>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {estadia.estado_actual === 'en_curso' && (
        <EditarEstadiaForm
          hotelId={hotelActual.hotelId}
          estadiaId={estadia.id}
          tarifaActual={estadia.reserva_habitacion.tarifa_dia}
          onGuardado={cargar}
        />
      )}

      {estadia.estado_actual === 'en_curso' && !mostrarCheckout && (
        <button
          onClick={() => {
            setCheckoutReal(ahoraLocal());
            setMostrarCheckout(true);
          }}
          style={{ ...btnPrimary, marginBottom: 20 }}
        >
          Hacer checkout
        </button>
      )}

      {estadia.estado_actual === 'en_curso' && mostrarCheckout && (
        <div
          style={{
            background: 'var(--surface-1)',
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
          <div style={{ width: 220 }}>
            <label style={labelStyle}>Fecha y hora de salida</label>
            <input
              type="datetime-local"
              value={checkoutReal}
              onChange={(e) => setCheckoutReal(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={{ width: 180 }}>
            <label style={labelStyle}>Cargo por late (S/.)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="Automático"
              value={cobroLate}
              onChange={(e) => setCobroLate(e.target.value)}
              style={inputStyle}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Vacío = se calcula solo (50% de la tarifa diaria si la salida es después de la hora de
              check-out del hotel). Pon 0 para no cobrar.
            </p>
          </div>
          <button onClick={confirmarCheckout} disabled={accionando} style={btnPrimary}>
            Confirmar checkout
          </button>
          <button onClick={() => setMostrarCheckout(false)} style={btnSecondary}>
            Cancelar
          </button>
        </div>
      )}

      {estadia.estado_actual !== 'finalizada' && (
        <RegistrarMovimientoForm
          hotelId={hotelActual.hotelId}
          estadiaId={estadia.id}
          onRegistrado={cargar}
        />
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
            <th style={thStyle}>Fecha</th>
            <th style={thStyle}>Tipo</th>
            <th style={thStyle}>Monto</th>
            <th style={thStyle}>Método</th>
            <th style={thStyle}>Personal</th>
            <th style={thStyle}>Notas</th>
          </tr>
        </thead>
        <tbody>
          {estadia.movimientos.map((m) => (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={tdStyle}>{new Date(m.fecha).toLocaleString()}</td>
              <td style={tdStyle}>{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
              <td style={{ ...tdStyle, color: Number(m.monto) < 0 ? 'var(--disponible)' : 'var(--text-secondary)' }}>
                {m.monto}
              </td>
              <td style={tdStyle}>{m.metodo_pago ?? '—'}</td>
              <td style={tdStyle}>{m.personal?.nombre ?? '—'}</td>
              <td style={tdStyle}>{m.notas ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditarEstadiaForm({
  hotelId,
  estadiaId,
  tarifaActual,
  onGuardado,
}: {
  hotelId: string;
  estadiaId: string;
  tarifaActual: number;
  onGuardado: () => void;
}) {
  const [mostrar, setMostrar] = useState(false);
  const [tarifaDiaNueva, setTarifaDiaNueva] = useState(String(tarifaActual));
  const [diasAdicionales, setDiasAdicionales] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const cuerpo: Record<string, number> = {};
      const tarifaNum = Number(tarifaDiaNueva);
      if (tarifaNum !== tarifaActual) cuerpo.tarifaDiaNueva = tarifaNum;
      if (diasAdicionales) cuerpo.diasAdicionales = Number(diasAdicionales);

      if (Object.keys(cuerpo).length === 0) {
        setError('No hay cambios para guardar');
        setEnviando(false);
        return;
      }

      await api.patch(`/hoteles/${hotelId}/estadias/${estadiaId}`, cuerpo);
      setDiasAdicionales('');
      setMostrar(false);
      onGuardado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setEnviando(false);
    }
  }

  if (!mostrar) {
    return (
      <button onClick={() => setMostrar(true)} style={{ ...btnSecondary, marginBottom: 20 }}>
        Editar estadía
      </button>
    );
  }

  return (
    <div
      style={{
        background: 'var(--surface-1)',
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
      <div style={{ width: 150 }}>
        <label style={labelStyle}>Tarifa/día (S/.)</label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={tarifaDiaNueva}
          onChange={(e) => setTarifaDiaNueva(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ width: 150 }}>
        <label style={labelStyle}>Días adicionales</label>
        <input
          type="number"
          min={1}
          placeholder="0"
          value={diasAdicionales}
          onChange={(e) => setDiasAdicionales(e.target.value)}
          style={inputStyle}
        />
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Extiende la salida programada y genera el cargo de alquiler de esos días.
        </p>
      </div>
      <button onClick={guardar} disabled={enviando} style={btnPrimary}>
        Guardar cambios
      </button>
      <button
        type="button"
        onClick={() => {
          setMostrar(false);
          setTarifaDiaNueva(String(tarifaActual));
          setDiasAdicionales('');
          setError(null);
        }}
        style={btnSecondary}
      >
        Cancelar
      </button>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, width: '100%' }}>{error}</p>}
    </div>
  );
}

function RegistrarMovimientoForm({
  hotelId,
  estadiaId,
  onRegistrado,
}: {
  hotelId: string;
  estadiaId: string;
  onRegistrado: () => void;
}) {
  const [tipo, setTipo] = useState('pago');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [notas, setNotas] = useState('');
  const [productos, setProductos] = useState<ProductoBazar[]>([]);
  const [productoId, setProductoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [pagadoAlMomento, setPagadoAlMomento] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ProductoBazar[]>(`/hoteles/${hotelId}/productos-bazar`).then(setProductos).catch(() => {});
  }, [hotelId]);

  const productosActivos = productos.filter((p) => p.activo);
  const requiereMetodo = tipo === 'pago' || (tipo === 'consumo_bazar' && pagadoAlMomento);

  function elegirProducto(id: string) {
    setProductoId(id);
    const producto = productos.find((p) => p.id === id);
    if (producto) setMonto(String(producto.precio * (Number(cantidad) || 1)));
  }

  function cambiarCantidad(valor: string) {
    setCantidad(valor);
    const producto = productos.find((p) => p.id === productoId);
    if (producto) setMonto(String(producto.precio * (Number(valor) || 1)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/estadias/${estadiaId}/movimientos`, {
        tipo,
        monto: Number(monto),
        metodoPago: requiereMetodo ? metodoPago : undefined,
        productoId: tipo === 'consumo_bazar' ? productoId : undefined,
        pagadoAlMomento: tipo === 'consumo_bazar' ? pagadoAlMomento : undefined,
        cantidad: tipo === 'consumo_bazar' ? Number(cantidad) || 1 : undefined,
        notas: notas || undefined,
      });
      setMonto('');
      setNotas('');
      setProductoId('');
      setCantidad('1');
      onRegistrado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento');
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
        gap: 8,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <label style={labelStyle}>Tipo</label>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={inputStyle}>
          {TIPOS_MOVIMIENTO.map((t) => (
            <option key={t} value={t}>
              {TIPO_LABEL[t] ?? t}
            </option>
          ))}
        </select>
      </div>
      {tipo === 'consumo_bazar' && (
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>Producto</label>
          <select value={productoId} onChange={(e) => elegirProducto(e.target.value)} style={inputStyle} required>
            <option value="">Selecciona...</option>
            {productosActivos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} (S/. {p.precio})
              </option>
            ))}
          </select>
          {productosActivos.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              No hay productos de bazar configurados (Configuración → Bazar).
            </p>
          )}
        </div>
      )}
      {tipo === 'consumo_bazar' && (
        <div style={{ width: 80 }}>
          <label style={labelStyle}>Cantidad</label>
          <input
            type="number"
            min={1}
            step={1}
            value={cantidad}
            onChange={(e) => cambiarCantidad(e.target.value)}
            style={inputStyle}
            required
          />
        </div>
      )}
      <div style={{ width: 100 }}>
        <label style={labelStyle}>Monto</label>
        <input type="number" min={0.01} step={0.01} value={monto} onChange={(e) => setMonto(e.target.value)} style={inputStyle} required />
      </div>
      {tipo === 'consumo_bazar' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}>
          <input type="checkbox" checked={pagadoAlMomento} onChange={(e) => setPagadoAlMomento(e.target.checked)} />
          Pagó al momento
        </label>
      )}
      {requiereMetodo && (
        <div>
          <label style={labelStyle}>Método</label>
          <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={inputStyle}>
            {METODOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 140 }}>
        <label style={labelStyle}>Notas</label>
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          style={inputStyle}
          placeholder={tipo === 'consumo_bazar' ? 'Opcional, se agrega al nombre del producto' : undefined}
        />
      </div>
      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Guardando...' : 'Registrar'}
      </button>
      {tipo === 'consumo_bazar' && !pagadoAlMomento && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', margin: 0 }}>
          No pagó al momento: solo se suma a lo que debe, no genera ingreso de caja ahora.
        </p>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, width: '100%' }}>{error}</p>}
    </form>
  );
}

const thStyle: CSSProperties = { padding: '6px 8px' };
const tdStyle: CSSProperties = { padding: '8px', color: 'var(--text-secondary)' };

const inputStyle: CSSProperties = {
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
