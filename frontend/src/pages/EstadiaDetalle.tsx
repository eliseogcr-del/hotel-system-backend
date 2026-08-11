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

interface HuespedInfo {
  nombres: string;
  apellidos: string;
  tipo_doc: string;
  nro_doc: string;
  telefono: string | null;
  correo: string | null;
}

interface VehiculoInfo {
  id: string;
  marca: string | null;
  tipo: string | null;
  placa: string | null;
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
    cochera_id: string | null;
    habitaciones: { hab_numero: number; piso: number } | null;
    reservas: { huesped_id: string; huespedes: HuespedInfo | null } | null;
    vehiculos: VehiculoInfo | null;
  };
}

interface Cochera {
  id: string;
  numero: string;
  tamano: string;
  tipo_vehiculo_permitido: string | null;
  estado: string;
  es_externa: boolean;
}

const TIPOS_MOVIMIENTO = ['pago', 'consumo_bazar', 'desayuno', 'ajuste', 'early', 'late', 'cochera'];
const METODOS = ['efectivo', 'transferencia', 'yape', 'tarjeta'];

const TIPO_LABEL: Record<string, string> = {
  alquiler: 'Alquiler',
  pago: 'Pago',
  consumo_bazar: 'Consumo de bazar',
  desayuno: 'Desayuno',
  ajuste: 'Ajuste',
  early: 'Early (entrada temprana)',
  late: 'Late (salida tardía)',
  cochera: 'Cochera',
};

interface TipoDesayuno {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean;
}

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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginBottom: 20 }}>
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
          huespedId={estadia.reserva_habitacion.reservas?.huesped_id ?? ''}
          huesped={estadia.reserva_habitacion.reservas?.huespedes ?? null}
          cocheraActualId={estadia.reserva_habitacion.cochera_id}
          vehiculoActual={estadia.reserva_habitacion.vehiculos}
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
          saldoActual={Number(estadia.saldo)}
          onRegistrado={cargar}
        />
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16, minWidth: 640 }}>
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
    </div>
  );
}

function EditarEstadiaForm({
  hotelId,
  estadiaId,
  tarifaActual,
  huespedId,
  huesped,
  cocheraActualId,
  vehiculoActual,
  onGuardado,
}: {
  hotelId: string;
  estadiaId: string;
  tarifaActual: number;
  huespedId: string;
  huesped: HuespedInfo | null;
  cocheraActualId: string | null;
  vehiculoActual: VehiculoInfo | null;
  onGuardado: () => void;
}) {
  const [mostrar, setMostrar] = useState(false);
  const [tarifaDiaNueva, setTarifaDiaNueva] = useState(String(tarifaActual));
  const [diasAdicionales, setDiasAdicionales] = useState('');

  const [nombres, setNombres] = useState(huesped?.nombres ?? '');
  const [apellidos, setApellidos] = useState(huesped?.apellidos ?? '');
  const [tipoDoc, setTipoDoc] = useState(huesped?.tipo_doc ?? 'dni');
  const [nroDoc, setNroDoc] = useState(huesped?.nro_doc ?? '');
  const [telefono, setTelefono] = useState(huesped?.telefono ?? '');
  const [correo, setCorreo] = useState(huesped?.correo ?? '');

  const [tieneVehiculo, setTieneVehiculo] = useState(!!vehiculoActual);
  const [vehiculoMarca, setVehiculoMarca] = useState(vehiculoActual?.marca ?? '');
  const [vehiculoTipo, setVehiculoTipo] = useState(vehiculoActual?.tipo ?? '');
  const [vehiculoPlaca, setVehiculoPlaca] = useState(vehiculoActual?.placa ?? '');
  const [cocheras, setCocheras] = useState<Cochera[]>([]);
  const [cocheraId, setCocheraId] = useState(cocheraActualId ?? '');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mostrar) return;
    api.get<Cochera[]>(`/hoteles/${hotelId}/cocheras`).then(setCocheras).catch(() => {});
  }, [mostrar, hotelId]);

  const cocherasSeleccionables = cocheras.filter((c) => c.estado === 'disponible' || c.id === cocheraActualId);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const cambiosHuesped: Record<string, string> = {};
      if (nombres !== huesped?.nombres) cambiosHuesped.nombres = nombres;
      if (apellidos !== huesped?.apellidos) cambiosHuesped.apellidos = apellidos;
      if (tipoDoc !== huesped?.tipo_doc) cambiosHuesped.tipoDoc = tipoDoc;
      if (nroDoc !== huesped?.nro_doc) cambiosHuesped.nroDoc = nroDoc;
      if (telefono !== (huesped?.telefono ?? '')) cambiosHuesped.telefono = telefono;
      if (correo !== (huesped?.correo ?? '')) cambiosHuesped.correo = correo;

      const cambiosEstadia: Record<string, string | number | boolean> = {};
      const tarifaNum = Number(tarifaDiaNueva);
      if (tarifaNum !== tarifaActual) cambiosEstadia.tarifaDiaNueva = tarifaNum;
      if (diasAdicionales) cambiosEstadia.diasAdicionales = Number(diasAdicionales);
      if (tieneVehiculo) {
        if (vehiculoMarca !== (vehiculoActual?.marca ?? '')) cambiosEstadia.vehiculoMarca = vehiculoMarca;
        if (vehiculoTipo !== (vehiculoActual?.tipo ?? '')) cambiosEstadia.vehiculoTipo = vehiculoTipo;
        if (vehiculoPlaca !== (vehiculoActual?.placa ?? '')) cambiosEstadia.vehiculoPlaca = vehiculoPlaca;
        if (cocheraId && cocheraId !== cocheraActualId) cambiosEstadia.cocheraId = cocheraId;
      } else if (cocheraActualId) {
        cambiosEstadia.quitarCochera = true;
      }

      if (Object.keys(cambiosHuesped).length === 0 && Object.keys(cambiosEstadia).length === 0) {
        setError('No hay cambios para guardar');
        setEnviando(false);
        return;
      }

      if (Object.keys(cambiosHuesped).length > 0) {
        await api.patch(`/hoteles/${hotelId}/huespedes/${huespedId}`, cambiosHuesped);
      }
      if (Object.keys(cambiosEstadia).length > 0) {
        await api.patch(`/hoteles/${hotelId}/estadias/${estadiaId}`, cambiosEstadia);
      }
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
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
          Datos del huésped
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>Nombres</label>
            <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={labelStyle}>Apellidos</label>
            <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ width: 160 }}>
            <label style={labelStyle}>Tipo de documento</label>
            <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} style={inputStyle}>
              <option value="dni">DNI</option>
              <option value="pasaporte">Pasaporte</option>
              <option value="carnet_extranjeria">Carnet de extranjería</option>
              <option value="cedula">Cédula</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div style={{ width: 150 }}>
            <label style={labelStyle}>N° documento</label>
            <input value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} style={inputStyle} />
          </div>
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

      <div>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
          Estadía
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
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
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Los días adicionales extienden la salida programada y generan el cargo de alquiler correspondiente.
        </p>
      </div>

      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
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
                {cocherasSeleccionables.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} ({c.tamano}
                    {c.tipo_vehiculo_permitido ? ` · ${c.tipo_vehiculo_permitido}` : ''}
                    {c.es_externa ? ' · externa' : ''})
                  </option>
                ))}
              </select>
              {cocherasSeleccionables.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  No hay cocheras disponibles ahora mismo.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
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
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  );
}

function RegistrarMovimientoForm({
  hotelId,
  estadiaId,
  saldoActual,
  onRegistrado,
}: {
  hotelId: string;
  estadiaId: string;
  saldoActual: number;
  onRegistrado: () => void;
}) {
  const [tipo, setTipo] = useState('pago');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [notas, setNotas] = useState('');
  const [productos, setProductos] = useState<ProductoBazar[]>([]);
  const [productoId, setProductoId] = useState('');
  const [tiposDesayuno, setTiposDesayuno] = useState<TipoDesayuno[]>([]);
  const [tipoDesayunoId, setTipoDesayunoId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [pagadoAlMomento, setPagadoAlMomento] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ProductoBazar[]>(`/hoteles/${hotelId}/productos-bazar`).then(setProductos).catch(() => {});
    api.get<TipoDesayuno[]>(`/hoteles/${hotelId}/tipos-desayuno`).then(setTiposDesayuno).catch(() => {});
  }, [hotelId]);

  const esVentaConCatalogo = tipo === 'consumo_bazar' || tipo === 'desayuno';
  const productosActivos = productos.filter((p) => p.activo);
  const tiposDesayunoActivos = tiposDesayuno.filter((t) => t.activo);
  const catalogo = tipo === 'consumo_bazar' ? productosActivos : tiposDesayunoActivos;
  const itemId = tipo === 'consumo_bazar' ? productoId : tipoDesayunoId;
  const requiereMetodo = tipo === 'pago' || (esVentaConCatalogo && pagadoAlMomento);

  function elegirItem(id: string) {
    if (tipo === 'consumo_bazar') setProductoId(id);
    else setTipoDesayunoId(id);
    const item = catalogo.find((p) => p.id === id);
    if (item) setMonto(String(item.precio * (Number(cantidad) || 1)));
  }

  function cambiarCantidad(valor: string) {
    setCantidad(valor);
    const item = catalogo.find((p) => p.id === itemId);
    if (item) setMonto(String(item.precio * (Number(valor) || 1)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (tipo === 'pago' && Number(monto) > saldoActual + 0.01) {
      setError(`El pago no puede ser mayor que la deuda actual (S/. ${saldoActual.toFixed(2)})`);
      return;
    }
    setEnviando(true);
    try {
      await api.post(`/hoteles/${hotelId}/estadias/${estadiaId}/movimientos`, {
        tipo,
        monto: Number(monto),
        metodoPago: requiereMetodo ? metodoPago : undefined,
        productoId: tipo === 'consumo_bazar' ? productoId : undefined,
        tipoDesayunoId: tipo === 'desayuno' ? tipoDesayunoId : undefined,
        pagadoAlMomento: esVentaConCatalogo ? pagadoAlMomento : undefined,
        cantidad: esVentaConCatalogo ? Number(cantidad) || 1 : undefined,
        notas: notas || undefined,
      });
      setMonto('');
      setNotas('');
      setProductoId('');
      setTipoDesayunoId('');
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
      {esVentaConCatalogo && (
        <div style={{ minWidth: 160 }}>
          <label style={labelStyle}>{tipo === 'consumo_bazar' ? 'Producto' : 'Tipo de desayuno'}</label>
          <select value={itemId} onChange={(e) => elegirItem(e.target.value)} style={inputStyle} required>
            <option value="">Selecciona...</option>
            {catalogo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} (S/. {p.precio})
              </option>
            ))}
          </select>
          {catalogo.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {tipo === 'consumo_bazar'
                ? 'No hay productos de bazar configurados (Configuración → Bazar).'
                : 'No hay tipos de desayuno configurados (Configuración → Tipos de desayuno).'}
            </p>
          )}
        </div>
      )}
      {esVentaConCatalogo && (
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
      <div style={{ width: 110 }}>
        <label style={labelStyle}>Monto</label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          max={tipo === 'pago' ? saldoActual : undefined}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          style={inputStyle}
          required
        />
        {tipo === 'pago' && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Máximo: S/. {saldoActual.toFixed(2)}
          </p>
        )}
      </div>
      {esVentaConCatalogo && (
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
          placeholder={esVentaConCatalogo ? 'Opcional, se agrega a la descripción' : undefined}
        />
      </div>
      <button type="submit" disabled={enviando} style={btnPrimary}>
        {enviando ? 'Guardando...' : 'Registrar'}
      </button>
      {esVentaConCatalogo && !pagadoAlMomento && (
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
  width: '100%',
  boxSizing: 'border-box',
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
