import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { buscarHuespedPorDni, buscarHuespedPorRuc, buscarHuespedesPorTexto, type Huesped } from '../lib/huespedes';

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
  nacionalidad: string | null;
  origen: string | null;
  fecha_nacimiento: string | null;
  ruc: string | null;
  razon_social: string | null;
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
  facturable: boolean;
  movimientos: MovimientoCuenta[];
  reserva_habitacion: {
    tarifa_dia: number;
    dias: number;
    nro_personas: number;
    incluye_desayuno: boolean;
    cochera_id: string | null;
    habitaciones: { hab_numero: number; piso: number; tipo_id: string } | null;
    reservas: { huesped_id: string; huespedes: HuespedInfo | null } | null;
    vehiculos: VehiculoInfo | null;
  };
}

interface HabitacionDisponible {
  id: string;
  hab_numero: number;
  piso: number;
  estado: string;
  tipos_habitacion: { nombre: string; aforo_max: number } | null;
}

interface TipoHabitacionPrecios {
  id: string;
  precio_normal: number;
  precio_corporativo: number;
  precio_web: number;
  precio_por_hora: number | null;
  precio_costo: number;
}

type TipoCliente = 'normal' | 'corporativo' | 'web';

function precioSegunTipoCliente(precios: TipoHabitacionPrecios | null, tipoCliente: TipoCliente): number {
  if (!precios) return 0;
  if (tipoCliente === 'corporativo') return Number(precios.precio_corporativo);
  if (tipoCliente === 'web') return Number(precios.precio_web);
  return Number(precios.precio_normal);
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
const TIPOS_VEHICULO = [
  { value: 'auto', label: 'Auto' },
  { value: 'camioneta', label: 'Camioneta' },
  { value: 'moto', label: 'Moto' },
  { value: 'otro', label: 'Otro' },
];

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

interface TipoCambioVigente {
  fecha: string;
  valor_compra: number;
  valor_venta: number;
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
  const [checkoutReal, setCheckoutReal] = useState(ahoraLocal());
  const [tipoCambio, setTipoCambio] = useState<TipoCambioVigente | null>(null);
  const [cajaAbierta, setCajaAbierta] = useState(true);
  const [editandoMovimientoId, setEditandoMovimientoId] = useState<string | null>(null);
  const [montoEdicion, setMontoEdicion] = useState('');
  const [metodoEdicion, setMetodoEdicion] = useState('efectivo');
  const [notasEdicion, setNotasEdicion] = useState('');
  const [mostrarEditar, setMostrarEditar] = useState(false);
  const [mostrarTraslado, setMostrarTraslado] = useState(false);
  const [tiposHabitacion, setTiposHabitacion] = useState<TipoHabitacionPrecios[]>([]);
  const esAdmin = hotelActual?.rol === 'admin';

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<TipoCambioVigente | null>(`/hoteles/${hotelActual.hotelId}/tipo-cambio/vigente`)
      .then(setTipoCambio)
      .catch(() => {});
  }, [hotelActual]);

  useEffect(() => {
    if (!hotelActual) return;
    api
      .get<TipoHabitacionPrecios[]>(`/hoteles/${hotelActual.hotelId}/tipos-habitacion`)
      .then(setTiposHabitacion)
      .catch(() => {});
  }, [hotelActual]);

  useEffect(() => {
    if (!hotelActual) return;
    // Se asume caja abierta mientras no se sepa lo contrario, para no
    // bloquear el formulario de golpe si esta consulta tarda o falla; el
    // backend igual rechaza el pago si de verdad no hay sesión abierta.
    api
      .get(`/hoteles/${hotelActual.hotelId}/caja/actual`)
      .then(() => setCajaAbierta(true))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setCajaAbierta(false);
      });
  }, [hotelActual]);

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
        checkoutReal: new Date(checkoutReal).toISOString(),
      });
      setMostrarCheckout(false);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo hacer el checkout');
    } finally {
      setAccionando(false);
    }
  }

  async function anularMovimiento(movimientoId: string) {
    if (!hotelActual || !id) return;
    if (!confirm('¿Anular este cargo? El importe pasará a S/. 0 y no se puede deshacer.')) return;
    setAccionando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelActual.hotelId}/estadias/${id}/movimientos/${movimientoId}/anular`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo anular el cargo');
    } finally {
      setAccionando(false);
    }
  }

  function iniciarEdicionMonto(movimientoId: string, montoActual: number, metodoActual: string | null, notasActuales: string | null) {
    setEditandoMovimientoId(movimientoId);
    setMontoEdicion(String(montoActual));
    setMetodoEdicion(metodoActual ?? 'efectivo');
    setNotasEdicion(notasActuales ?? '');
    setError(null);
  }

  async function guardarEdicionMonto(movimientoId: string, teniaMetodo: boolean) {
    if (!hotelActual || !id || montoEdicion === '') return;
    setAccionando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/estadias/${id}/movimientos/${movimientoId}`, {
        monto: Number(montoEdicion),
        metodoPago: teniaMetodo ? metodoEdicion : undefined,
        notas: notasEdicion,
      });
      setEditandoMovimientoId(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo editar el movimiento');
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
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 2px' }}>Tarifa</p>
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            PEN {Number(estadia.reserva_habitacion.tarifa_dia).toFixed(2)}
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
              {' '}/día × {estadia.reserva_habitacion.dias}
            </span>
          </p>
        </div>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <button onClick={() => setMostrarEditar(true)} style={btnSecondary}>
            Editar estadía
          </button>
          <button onClick={() => setMostrarTraslado(true)} style={btnSecondary}>
            Traslado de habitación
          </button>
        </div>
      )}

      {mostrarTraslado && (
        <TrasladoHabitacionModal
          hotelId={hotelActual.hotelId}
          estadiaId={estadia.id}
          habitacionActualNumero={estadia.reserva_habitacion.habitaciones?.hab_numero ?? 0}
          nroPersonas={estadia.reserva_habitacion.nro_personas}
          onClose={() => setMostrarTraslado(false)}
          onTrasladado={() => {
            setMostrarTraslado(false);
            cargar();
          }}
        />
      )}

      {mostrarEditar && (
        <EditarEstadiaModal
          hotelId={hotelActual.hotelId}
          estadiaId={estadia.id}
          checkinReal={estadia.checkin_real}
          tarifaActual={estadia.reserva_habitacion.tarifa_dia}
          diasActuales={estadia.reserva_habitacion.dias}
          nroPersonasActual={estadia.reserva_habitacion.nro_personas}
          incluyeDesayunoActual={estadia.reserva_habitacion.incluye_desayuno}
          facturableActual={estadia.facturable}
          tipoHabitacionId={estadia.reserva_habitacion.habitaciones?.tipo_id}
          precios={tiposHabitacion.find((t) => t.id === estadia.reserva_habitacion.habitaciones?.tipo_id) ?? null}
          huespedId={estadia.reserva_habitacion.reservas?.huesped_id ?? ''}
          huesped={estadia.reserva_habitacion.reservas?.huespedes ?? null}
          cocheraActualId={estadia.reserva_habitacion.cochera_id}
          vehiculoActual={estadia.reserva_habitacion.vehiculos}
          onClose={() => setMostrarEditar(false)}
          onGuardado={() => {
            setMostrarEditar(false);
            cargar();
          }}
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
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              El checkout ya no cobra late solo. Si corresponde, regístralo primero abajo en "Registrar
              movimiento" (Tipo: Late) antes de confirmar el checkout.
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

      {(estadia.estado_actual !== 'finalizada' || Number(estadia.saldo) > 0) && (
        <RegistrarMovimientoForm
          hotelId={hotelActual.hotelId}
          estadiaId={estadia.id}
          saldoActual={Number(estadia.saldo)}
          tipoCambio={tipoCambio}
          cajaAbierta={cajaAbierta}
          soloPagoAjuste={estadia.estado_actual === 'finalizada'}
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
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {estadia.movimientos.map((m) => {
              // Un monto negativo es un pago/abono del huésped (reduce la
              // deuda); positivo es un cargo -- lo que se le está cobrando
              // (cuenta por cobrar). Se distinguen por color para que se
              // note de un vistazo cuál es cuál en un libro que mezcla los
              // dos tipos de movimiento.
              const esPago = Number(m.monto) < 0;
              const esCargoAnulable = Number(m.monto) > 0 && estadia.estado_actual !== 'finalizada';
              const color = esPago ? 'var(--ingreso)' : 'var(--disponible)';
              const bg = esPago ? 'var(--ingreso-bg)' : 'var(--disponible-bg)';
              return (
                <tr key={m.id} style={{ borderTop: '1px solid var(--border)', background: bg }}>
                  <td style={{ ...tdStyle, color }}>{new Date(m.fecha).toLocaleString()}</td>
                  <td style={{ ...tdStyle, color, fontWeight: 500 }}>{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
                  <td style={{ ...tdStyle, color, fontWeight: 600 }}>
                    {editandoMovimientoId === m.id ? (
                      <input
                        type="number"
                        step={0.01}
                        value={montoEdicion}
                        onChange={(e) => setMontoEdicion(e.target.value)}
                        style={{ width: 90, padding: '2px 4px', fontSize: 12 }}
                        autoFocus
                      />
                    ) : (
                      m.monto
                    )}
                  </td>
                  <td style={{ ...tdStyle, color }}>
                    {editandoMovimientoId === m.id && m.metodo_pago !== null ? (
                      <select
                        value={metodoEdicion}
                        onChange={(e) => setMetodoEdicion(e.target.value)}
                        style={{ fontSize: 12, padding: '2px 4px' }}
                      >
                        {METODOS.map((met) => (
                          <option key={met} value={met}>
                            {met}
                          </option>
                        ))}
                      </select>
                    ) : (
                      m.metodo_pago ?? '—'
                    )}
                  </td>
                  <td style={{ ...tdStyle, color }}>{m.personal?.nombre ?? '—'}</td>
                  <td style={{ ...tdStyle, color }}>
                    {editandoMovimientoId === m.id ? (
                      <input
                        value={notasEdicion}
                        onChange={(e) => setNotasEdicion(e.target.value)}
                        style={{ width: 160, padding: '2px 4px', fontSize: 12 }}
                      />
                    ) : (
                      m.notas ?? ''
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editandoMovimientoId === m.id ? (
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => guardarEdicionMonto(m.id, m.metodo_pago !== null)}
                          disabled={accionando}
                          style={{ border: 'none', background: 'transparent', color: 'var(--brand)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditandoMovimientoId(null)}
                          disabled={accionando}
                          style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 8 }}>
                        {esCargoAnulable && (
                          <button
                            onClick={() => anularMovimiento(m.id)}
                            disabled={accionando}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--danger)',
                              fontSize: 12,
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            Anular
                          </button>
                        )}
                        {esAdmin && (
                          <button
                            onClick={() => iniciarEdicionMonto(m.id, Number(m.monto), m.metodo_pago, m.notas)}
                            disabled={accionando}
                            style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                          >
                            Editar
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditarEstadiaModal({
  hotelId,
  estadiaId,
  checkinReal,
  tarifaActual,
  diasActuales,
  nroPersonasActual,
  incluyeDesayunoActual,
  facturableActual,
  precios,
  huespedId,
  huesped,
  cocheraActualId,
  vehiculoActual,
  onClose,
  onGuardado,
}: {
  hotelId: string;
  estadiaId: string;
  checkinReal: string | null;
  tarifaActual: number;
  diasActuales: number;
  nroPersonasActual: number;
  incluyeDesayunoActual: boolean;
  facturableActual: boolean;
  tipoHabitacionId?: string;
  precios: TipoHabitacionPrecios | null;
  huespedId: string;
  huesped: HuespedInfo | null;
  cocheraActualId: string | null;
  vehiculoActual: VehiculoInfo | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const isMobile = useIsMobile();

  const [huespedIdActivo, setHuespedIdActivo] = useState(huespedId);
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [mensajeBusqueda, setMensajeBusqueda] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Huesped[]>([]);
  const reasignando = huespedIdActivo !== huespedId;

  const [nombres, setNombres] = useState(huesped?.nombres ?? '');
  const [apellidos, setApellidos] = useState(huesped?.apellidos ?? '');
  const [tipoDoc, setTipoDoc] = useState(huesped?.tipo_doc ?? 'dni');
  const [nroDoc, setNroDoc] = useState(huesped?.nro_doc ?? '');
  const [telefono, setTelefono] = useState(huesped?.telefono ?? '');
  const [correo, setCorreo] = useState(huesped?.correo ?? '');
  const [nacionalidad, setNacionalidad] = useState(huesped?.nacionalidad ?? '');
  const [origen, setOrigen] = useState(huesped?.origen ?? '');
  const [fechaNacimiento, setFechaNacimiento] = useState(huesped?.fecha_nacimiento ?? '');
  const [ruc, setRuc] = useState(huesped?.ruc ?? '');
  const [razonSocial, setRazonSocial] = useState(huesped?.razon_social ?? '');

  const [nroPersonas, setNroPersonas] = useState(nroPersonasActual);
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>('normal');
  const [tarifaDiaNueva, setTarifaDiaNueva] = useState(String(tarifaActual));
  const [diasAdicionales, setDiasAdicionales] = useState('');
  const [incluyeDesayuno, setIncluyeDesayuno] = useState(incluyeDesayunoActual);
  const [facturable, setFacturable] = useState(facturableActual);

  const [tieneVehiculo, setTieneVehiculo] = useState(!!vehiculoActual);
  const [vehiculoMarca, setVehiculoMarca] = useState(vehiculoActual?.marca ?? '');
  const [vehiculoTipo, setVehiculoTipo] = useState(vehiculoActual?.tipo ?? '');
  const [vehiculoPlaca, setVehiculoPlaca] = useState(vehiculoActual?.placa ?? '');
  const [cocheras, setCocheras] = useState<Cochera[]>([]);
  const [cocheraId, setCocheraId] = useState(cocheraActualId ?? '');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Cochera[]>(`/hoteles/${hotelId}/cocheras`).then(setCocheras).catch(() => {});
  }, [hotelId]);

  const cocherasSeleccionables = cocheras.filter((c) => c.estado === 'disponible' || c.id === cocheraActualId);
  const precioCosto = precios ? Number(precios.precio_costo) : 0;
  const tarifaBajoCosto = precioCosto > 0 && Number(tarifaDiaNueva) < precioCosto;

  function cambiarTipoCliente(valor: TipoCliente) {
    setTipoCliente(valor);
    setTarifaDiaNueva(String(precioSegunTipoCliente(precios, valor)));
  }

  function seleccionarHuesped(h: Huesped) {
    setHuespedIdActivo(h.id);
    setNombres(h.nombres);
    setApellidos(h.apellidos);
    setTipoDoc(h.tipo_doc);
    setNroDoc(h.nro_doc);
    setTelefono(h.telefono ?? '');
    setCorreo(h.correo ?? '');
    setNacionalidad(h.nacionalidad ?? '');
    setOrigen(h.origen ?? '');
    setFechaNacimiento(h.fecha_nacimiento ?? '');
    setRuc(h.ruc ?? '');
    setRazonSocial(h.razon_social ?? '');
    setResultados([]);
    setMensajeBusqueda('Huésped encontrado — se reasignará esta habitación a esta persona al guardar.');
  }

  function cancelarReasignacion() {
    setHuespedIdActivo(huespedId);
    setNombres(huesped?.nombres ?? '');
    setApellidos(huesped?.apellidos ?? '');
    setTipoDoc(huesped?.tipo_doc ?? 'dni');
    setNroDoc(huesped?.nro_doc ?? '');
    setTelefono(huesped?.telefono ?? '');
    setCorreo(huesped?.correo ?? '');
    setNacionalidad(huesped?.nacionalidad ?? '');
    setOrigen(huesped?.origen ?? '');
    setFechaNacimiento(huesped?.fecha_nacimiento ?? '');
    setRuc(huesped?.ruc ?? '');
    setRazonSocial(huesped?.razon_social ?? '');
    setBusqueda('');
    setMensajeBusqueda(null);
    setResultados([]);
  }

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
        setMensajeBusqueda('No se encontró ningún huésped con ese dato.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el huésped');
    } finally {
      setBuscando(false);
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const cambiosEstadia: Record<string, string | number | boolean> = {};
      const tarifaNum = Number(tarifaDiaNueva);
      if (tarifaNum !== tarifaActual) cambiosEstadia.tarifaDiaNueva = tarifaNum;
      if (diasAdicionales) cambiosEstadia.diasAdicionales = Number(diasAdicionales);
      if (nroPersonas !== nroPersonasActual) cambiosEstadia.nroPersonas = nroPersonas;
      if (incluyeDesayuno !== incluyeDesayunoActual) cambiosEstadia.incluyeDesayuno = incluyeDesayuno;
      if (facturable !== facturableActual) cambiosEstadia.facturable = facturable;
      if (tieneVehiculo) {
        if (vehiculoMarca !== (vehiculoActual?.marca ?? '')) cambiosEstadia.vehiculoMarca = vehiculoMarca;
        if (vehiculoTipo !== (vehiculoActual?.tipo ?? '')) cambiosEstadia.vehiculoTipo = vehiculoTipo;
        if (vehiculoPlaca !== (vehiculoActual?.placa ?? '')) cambiosEstadia.vehiculoPlaca = vehiculoPlaca;
        if (cocheraId && cocheraId !== cocheraActualId) cambiosEstadia.cocheraId = cocheraId;
      } else if (cocheraActualId) {
        cambiosEstadia.quitarCochera = true;
      }
      if (reasignando) cambiosEstadia.nuevoHuespedId = huespedIdActivo;

      // Reasignar a un huésped ya existente NUNCA edita sus datos en el
      // mismo paso: ese registro puede estar compartido por otras
      // habitaciones (ej. el contacto de un grupo), así que tocar sus
      // campos aquí corrompería esas otras reservas también. Editar datos
      // en línea solo aplica cuando se sigue apuntando al huésped original.
      const cambiosHuesped: Record<string, string> = {};
      if (!reasignando) {
        if (nombres !== huesped?.nombres) cambiosHuesped.nombres = nombres;
        if (apellidos !== huesped?.apellidos) cambiosHuesped.apellidos = apellidos;
        if (tipoDoc !== huesped?.tipo_doc) cambiosHuesped.tipoDoc = tipoDoc;
        if (nroDoc !== huesped?.nro_doc) cambiosHuesped.nroDoc = nroDoc;
        if (telefono !== (huesped?.telefono ?? '')) cambiosHuesped.telefono = telefono;
        if (correo !== (huesped?.correo ?? '')) cambiosHuesped.correo = correo;
        if (nacionalidad !== (huesped?.nacionalidad ?? '')) cambiosHuesped.nacionalidad = nacionalidad;
        if (nacionalidad === 'extranjero' && origen !== (huesped?.origen ?? '')) cambiosHuesped.origen = origen;
        if (fechaNacimiento !== (huesped?.fecha_nacimiento ?? '')) cambiosHuesped.fechaNacimiento = fechaNacimiento;
        if (ruc !== (huesped?.ruc ?? '')) cambiosHuesped.ruc = ruc;
        if (razonSocial !== (huesped?.razon_social ?? '')) cambiosHuesped.razonSocial = razonSocial;
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
      onGuardado();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          `${err.message} — si es una persona distinta, usa "Buscar huésped" arriba para reasignar la habitación en vez de editar estos datos.`,
        );
      } else {
        setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
      }
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
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>Editar estadía</h2>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <form onSubmit={guardar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ---------- Buscar/reasignar huésped ---------- */}
          <div style={cardStyle}>
            <p style={cardTitleStyle}>Buscar huésped</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Usa esto solo si la habitación quedó asignada al huésped equivocado (ej. se registró bajo el
              contacto de un grupo) y quieres reasignarla a otra persona que ya existe en el sistema. Para
              corregir un dato del huésped actual (typo en el nombre, teléfono, etc.), edítalo directamente
              abajo sin buscar.
            </p>
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
              <button type="button" onClick={buscar} disabled={buscando} style={btnSecondary}>
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
              {reasignando && (
                <button type="button" onClick={cancelarReasignacion} style={btnSecondary}>
                  Cancelar reasignación
                </button>
              )}
            </div>
            {mensajeBusqueda && (
              <p
                style={{
                  fontSize: 11,
                  color: reasignando ? 'var(--disponible)' : 'var(--text-muted)',
                  margin: '6px 0 0',
                }}
              >
                {mensajeBusqueda}
              </p>
            )}
            {resultados.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>
                  Se encontró más de un huésped, elige uno:
                </p>
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
              {reasignando && (
                <p style={{ fontSize: 11, color: 'var(--disponible)', margin: '0 0 8px' }}>
                  Mostrando los datos del huésped que se va a asignar a esta habitación (de solo lectura).
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>Tipo de documento</label>
                  <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} style={inputStyle} disabled={reasignando}>
                    <option value="dni">DNI</option>
                    <option value="pasaporte">Pasaporte</option>
                    <option value="carnet_extranjeria">Carnet de extranjería</option>
                    <option value="cedula">Cédula</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Número de documento</label>
                  <input value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} style={inputStyle} required disabled={reasignando} />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Nombres</label>
                  <input value={nombres} onChange={(e) => setNombres(e.target.value)} style={inputStyle} required disabled={reasignando} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Apellidos</label>
                  <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} style={inputStyle} required disabled={reasignando} />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Teléfono</label>
                  <input value={telefono} onChange={(e) => setTelefono(e.target.value)} style={inputStyle} disabled={reasignando} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Correo</label>
                  <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} style={inputStyle} disabled={reasignando} />
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <p style={cardTitleStyle}>Nacionalidad y facturación</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>Nacionalidad</label>
                  <select value={nacionalidad} onChange={(e) => setNacionalidad(e.target.value)} style={inputStyle} disabled={reasignando}>
                    <option value="">Sin especificar</option>
                    <option value="peruano">Peruano</option>
                    <option value="extranjero">Extranjero</option>
                  </select>
                </div>
                {nacionalidad === 'extranjero' && (
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={labelStyle}>País de origen</label>
                    <input value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="Ej. Colombia" style={inputStyle} disabled={reasignando} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Fecha de nacimiento</label>
                  <input
                    type="date"
                    value={fechaNacimiento}
                    onChange={(e) => setFechaNacimiento(e.target.value)}
                    style={inputStyle}
                    disabled={reasignando}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>RUC</label>
                  <input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="11 dígitos" maxLength={11} style={inputStyle} disabled={reasignando} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={labelStyle}>Razón social</label>
                  <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} style={inputStyle} disabled={reasignando} />
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
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Días actuales: {diasActuales}. Los días adicionales extienden la salida programada y generan el
                cargo de alquiler correspondiente (no se puede reducir).
              </p>
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Fecha y hora de check-in</label>
                <input
                  type="text"
                  value={checkinReal ? new Date(checkinReal).toLocaleString('es-PE') : '—'}
                  disabled
                  style={{ ...inputStyle, background: 'var(--surface-2, var(--surface-1))', color: 'var(--text-muted)' }}
                />
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  No se puede editar: es el momento real en que ingresó el huésped.
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 6 }}>
                <input type="checkbox" checked={incluyeDesayuno} onChange={(e) => setIncluyeDesayuno(e.target.checked)} />
                Incluye desayuno (cortesía, no se cobra)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={facturable} onChange={(e) => setFacturable(e.target.checked)} />
                Facturable (se le emitirá boleta/factura)
              </label>
            </div>

            <div style={cardStyle}>
              <p style={cardTitleStyle}>Tarifa</p>
              <div style={{ width: 150 }}>
                <label style={labelStyle}>Tarifa/día (S/.)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={tarifaDiaNueva}
                  onChange={(e) => setTarifaDiaNueva(e.target.value)}
                  style={{
                    ...inputStyle,
                    ...(tarifaBajoCosto ? { borderColor: 'var(--danger)' } : {}),
                  }}
                />
              </div>
              <p style={{ fontSize: 11, color: tarifaBajoCosto ? 'var(--danger)' : 'var(--text-muted)', margin: '6px 0 0' }}>
                {precioCosto > 0
                  ? `Precio de costo: S/. ${precioCosto}${tarifaBajoCosto ? ' — la tarifa no puede quedar por debajo de este valor.' : ''}`
                  : 'Este tipo de habitación no tiene un precio de costo configurado.'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                Cambiar la tarifa aplica desde ahora en adelante; no recalcula los cargos ya registrados.
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

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando || tarifaBajoCosto} style={btnPrimary}>
              {enviando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TrasladoHabitacionModal({
  hotelId,
  estadiaId,
  habitacionActualNumero,
  nroPersonas,
  onClose,
  onTrasladado,
}: {
  hotelId: string;
  estadiaId: string;
  habitacionActualNumero: number;
  nroPersonas: number;
  onClose: () => void;
  onTrasladado: () => void;
}) {
  const [habitaciones, setHabitaciones] = useState<HabitacionDisponible[]>([]);
  const [nuevaHabitacionId, setNuevaHabitacionId] = useState('');
  const [habitacionQuedaLimpia, setHabitacionQuedaLimpia] = useState(true);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<HabitacionDisponible[]>(`/hoteles/${hotelId}/habitaciones`).then(setHabitaciones).catch(() => {});
  }, [hotelId]);

  const disponibles = habitaciones.filter((h) => h.estado === 'disponible');
  const destino = disponibles.find((h) => h.id === nuevaHabitacionId) ?? null;
  const aforoInsuficiente = !!destino && destino.tipos_habitacion != null && nroPersonas > destino.tipos_habitacion.aforo_max;

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!nuevaHabitacionId) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/estadias/${estadiaId}/trasladar-habitacion`, {
        nuevaHabitacionId,
        habitacionQuedaLimpia,
        motivo: motivo || undefined,
      });
      onTrasladado();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo trasladar la habitación');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 480 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>Traslado de habitación</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Habitación actual: {habitacionActualNumero}. Se conserva el mismo huésped, saldo e historial de pagos —
          solo cambia la habitación.
        </p>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <form onSubmit={confirmar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Nueva habitación</label>
            <select
              value={nuevaHabitacionId}
              onChange={(e) => setNuevaHabitacionId(e.target.value)}
              style={inputStyle}
              required
            >
              <option value="">Selecciona una habitación disponible...</option>
              {disponibles.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.hab_numero} · piso {h.piso}
                  {h.tipos_habitacion ? ` · ${h.tipos_habitacion.nombre}` : ''}
                </option>
              ))}
            </select>
            {disponibles.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                No hay habitaciones disponibles ahora mismo.
              </p>
            )}
            {aforoInsuficiente && destino?.tipos_habitacion && (
              <p style={{ fontSize: 11, color: 'var(--danger)', margin: '4px 0 0' }}>
                Esta habitación admite hasta {destino.tipos_habitacion.aforo_max} persona(s); la estadía tiene{' '}
                {nroPersonas}.
              </p>
            )}
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={habitacionQuedaLimpia}
                onChange={(e) => setHabitacionQuedaLimpia(e.target.checked)}
              />
              La habitación {habitacionActualNumero} queda limpia
            </label>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {habitacionQuedaLimpia
                ? `Si está desmarcado, la ${habitacionActualNumero} queda disponible de inmediato.`
                : `La habitación ${habitacionActualNumero} pasará a "limpieza" y se generará una tarea para HK.`}
            </p>
          </div>

          <div>
            <label style={labelStyle}>Motivo (opcional)</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. no le gustó la vista"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Cancelar
            </button>
            <button type="submit" disabled={enviando || !nuevaHabitacionId || aforoInsuficiente} style={btnPrimary}>
              {enviando ? 'Trasladando...' : 'Confirmar traslado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RegistrarMovimientoForm({
  hotelId,
  estadiaId,
  saldoActual,
  tipoCambio,
  cajaAbierta,
  soloPagoAjuste,
  onRegistrado,
}: {
  hotelId: string;
  estadiaId: string;
  saldoActual: number;
  tipoCambio: TipoCambioVigente | null;
  cajaAbierta: boolean;
  soloPagoAjuste: boolean;
  onRegistrado: () => void;
}) {
  const tiposDisponibles = soloPagoAjuste ? TIPOS_MOVIMIENTO.filter((t) => t === 'pago' || t === 'ajuste') : TIPOS_MOVIMIENTO;
  const [tipo, setTipo] = useState('pago');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
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
  const montoPEN =
    tipo === 'pago' && moneda === 'USD' && tipoCambio
      ? Number(monto || 0) * Number(tipoCambio.valor_compra)
      : Number(monto || 0);

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
    if (requiereMetodo && !cajaAbierta) {
      setError('No tienes una caja abierta: ve al módulo Caja y abre tu turno antes de registrar cobros.');
      return;
    }
    if (tipo === 'pago' && moneda === 'USD' && !tipoCambio) {
      setError('No hay un tipo de cambio configurado (Configuración → Tipo de cambio).');
      return;
    }
    if (tipo === 'pago' && montoPEN > saldoActual + 0.01) {
      setError(`El pago no puede ser mayor que la deuda actual (S/. ${saldoActual.toFixed(2)})`);
      return;
    }
    setEnviando(true);
    try {
      await api.post(`/hoteles/${hotelId}/estadias/${estadiaId}/movimientos`, {
        tipo,
        monto: Number(monto),
        moneda: tipo === 'pago' && moneda === 'USD' ? 'USD' : undefined,
        metodoPago: requiereMetodo ? metodoPago : undefined,
        productoId: tipo === 'consumo_bazar' ? productoId : undefined,
        tipoDesayunoId: tipo === 'desayuno' ? tipoDesayunoId : undefined,
        pagadoAlMomento: esVentaConCatalogo ? pagadoAlMomento : undefined,
        cantidad: esVentaConCatalogo ? Number(cantidad) || 1 : undefined,
        notas: notas || undefined,
      });
      setMonto('');
      setMoneda('PEN');
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
          {tiposDisponibles.map((t) => (
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
      {tipo === 'pago' && (
        <div style={{ width: 90 }}>
          <label style={labelStyle}>Moneda</label>
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as 'PEN' | 'USD')} style={inputStyle}>
            <option value="PEN">PEN</option>
            <option value="USD">USD</option>
          </select>
        </div>
      )}
      <div style={{ width: 110 }}>
        <label style={labelStyle}>Monto {tipo === 'pago' ? `(${moneda})` : ''}</label>
        <input
          type="number"
          min={0.01}
          step={0.01}
          max={tipo === 'pago' && moneda === 'PEN' ? saldoActual : undefined}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          style={inputStyle}
          required
        />
        {tipo === 'pago' && moneda === 'PEN' && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Máximo: S/. {saldoActual.toFixed(2)}
          </p>
        )}
        {tipo === 'pago' && moneda === 'USD' && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {tipoCambio
              ? `≈ S/. ${montoPEN.toFixed(2)} al T.C. compra ${Number(tipoCambio.valor_compra).toFixed(3)} · Máximo: S/. ${saldoActual.toFixed(2)}`
              : 'No hay tipo de cambio configurado (Configuración → Tipo de cambio).'}
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
      <button type="submit" disabled={enviando || (requiereMetodo && !cajaAbierta)} style={btnPrimary}>
        {enviando ? 'Guardando...' : 'Registrar'}
      </button>
      {esVentaConCatalogo && !pagadoAlMomento && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', margin: 0 }}>
          No pagó al momento: solo se suma a lo que debe, no genera ingreso de caja ahora.
        </p>
      )}
      {soloPagoAjuste && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', margin: 0 }}>
          Esta estadía ya finalizó: solo se puede registrar un pago o ajuste para saldar la deuda pendiente.
        </p>
      )}
      {requiereMetodo && !cajaAbierta && (
        <p style={{ color: 'var(--egreso)', fontSize: 12, width: '100%', margin: 0 }}>
          No tienes una caja abierta: ve al módulo Caja y abre tu turno antes de registrar cobros.
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
