import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  buscarHuespedPorDni,
  buscarHuespedPorRuc,
  buscarHuespedesPorNombre,
  buscarEmpresaPorRuc,
  buscarEmpresasPorNombre,
  crearHuesped,
  type Huesped,
  type Empresa,
} from '../lib/huespedes';

type ResultadoCliente = { tipo: 'huesped'; data: Huesped } | { tipo: 'empresa'; data: Empresa };

const ORIGENES = ['telefono', 'whatsapp', 'booking', 'airbnb', 'directo', 'walkin'];
const METODOS_PAGO = ['efectivo', 'yape', 'transferencia', 'tarjeta'];

interface ReservaHabitacionDetalle {
  id: string;
  habitacion_id: string;
  nro_personas: number;
  incluye_desayuno: boolean;
  con_mascota: boolean;
  tarifa_dia: number;
  dias: number;
  fecha_hora_checkin_prevista: string;
  fecha_hora_checkout_prevista: string;
  observaciones: string | null;
  vehiculos: { marca: string | null; tipo: string | null; placa: string | null } | null;
}

interface AnticipoExistente {
  id: string;
  monto: number;
  metodo_pago: string;
  fecha: string;
}

interface ReservaDetalle {
  id: string;
  origen: string;
  moneda: 'PEN' | 'USD';
  estado: string;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
  reserva_habitacion: ReservaHabitacionDetalle[];
  anticipos_reserva: AnticipoExistente[];
}

interface Props {
  hotelId: string;
  habitacionId: string;
  habNumero: number;
  aforoMax: number;
  tarifaSugerida: number;
  precioMascotaDia: number;
  modo: 'crear' | 'editar';
  fechaInicial?: string; // YYYY-MM-DD, solo modo 'crear'
  horaSugerida?: string; // HH:MM, hora_checkin del hotel
  reservaId?: string; // solo modo 'editar'
  lineaId?: string; // solo modo 'editar'
  onClose: () => void;
  onGuardado: () => void;
}

function hoyYMD(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function horaActual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isoAFechaLocal(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function isoAHoraLocal(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(11, 16);
}

function calcularCheckout(fecha: string, hora: string, dias: number): Date | null {
  if (!fecha || !hora || !dias) return null;
  const checkin = new Date(`${fecha}T${hora}:00`);
  if (Number.isNaN(checkin.getTime())) return null;
  return new Date(checkin.getTime() + dias * 24 * 60 * 60 * 1000);
}

export function ReservaFormModal({
  hotelId,
  habitacionId,
  habNumero,
  aforoMax,
  tarifaSugerida,
  precioMascotaDia,
  modo,
  fechaInicial,
  horaSugerida,
  reservaId,
  lineaId,
  onClose,
  onGuardado,
}: Props) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [cargando, setCargando] = useState(modo === 'editar');
  const [huespedNombre, setHuespedNombre] = useState<string | null>(null);
  const [reservaEstado, setReservaEstado] = useState<string | null>(null);
  const [haciendoCheckin, setHaciendoCheckin] = useState(false);

  // Cliente (solo modo 'crear'): DNI/RUC exacto o nombre parcial. Puede
  // resolver a un huésped, a una empresa, a varias coincidencias por
  // nombre (para elegir) o a "no existe, completa los datos".
  const [busqueda, setBusqueda] = useState('');
  const [huespedId, setHuespedId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [huespedRuc, setHuespedRuc] = useState('');
  const [huespedRazonSocial, setHuespedRazonSocial] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [rucEmpresa, setRucEmpresa] = useState('');
  const [resultados, setResultados] = useState<ResultadoCliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);

  const [observaciones, setObservaciones] = useState('');

  const [origen, setOrigen] = useState('directo');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [fecha, setFecha] = useState(fechaInicial || hoyYMD());
  const [hora, setHora] = useState(horaSugerida || horaActual());
  const [dias, setDias] = useState(1);
  const [nroPersonas, setNroPersonas] = useState(2);
  const [incluyeDesayuno, setIncluyeDesayuno] = useState(false);
  const [conMascota, setConMascota] = useState(false);
  const [tieneVehiculo, setTieneVehiculo] = useState(false);
  const [vehiculoMarca, setVehiculoMarca] = useState('');
  const [vehiculoTipo, setVehiculoTipo] = useState('');
  const [vehiculoPlaca, setVehiculoPlaca] = useState('');
  const [tarifaDia, setTarifaDia] = useState(tarifaSugerida);

  const [anticiposExistentes, setAnticiposExistentes] = useState<AnticipoExistente[]>([]);
  const [anticipoMonto, setAnticipoMonto] = useState('');
  const [anticipoMetodoPago, setAnticipoMetodoPago] = useState('efectivo');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mostrarAnular, setMostrarAnular] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);

  useEffect(() => {
    if (modo !== 'editar' || !reservaId) return;
    api
      .get<ReservaDetalle>(`/hoteles/${hotelId}/reservas/${reservaId}`)
      .then((reserva) => {
        const linea = reserva.reserva_habitacion.find((l) => l.id === lineaId);
        setOrigen(reserva.origen);
        setMoneda(reserva.moneda);
        setReservaEstado(reserva.estado);
        setHuespedNombre(
          reserva.huespedes
            ? `${reserva.huespedes.nombres} ${reserva.huespedes.apellidos}`
            : (reserva.empresas?.razon_social ?? null),
        );
        setAnticiposExistentes(reserva.anticipos_reserva ?? []);
        if (linea) {
          setFecha(isoAFechaLocal(linea.fecha_hora_checkin_prevista));
          setHora(isoAHoraLocal(linea.fecha_hora_checkin_prevista));
          setDias(linea.dias);
          setNroPersonas(linea.nro_personas);
          setIncluyeDesayuno(linea.incluye_desayuno);
          setConMascota(linea.con_mascota);
          setTarifaDia(Number(linea.tarifa_dia));
          setObservaciones(linea.observaciones ?? '');
          if (linea.vehiculos && (linea.vehiculos.marca || linea.vehiculos.tipo || linea.vehiculos.placa)) {
            setTieneVehiculo(true);
            setVehiculoMarca(linea.vehiculos.marca ?? '');
            setVehiculoTipo(linea.vehiculos.tipo ?? '');
            setVehiculoPlaca(linea.vehiculos.placa ?? '');
          }
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudo cargar la reserva'))
      .finally(() => setCargando(false));
  }, [modo, reservaId, lineaId, hotelId]);

  function limpiarSeleccionCliente() {
    setHuespedId(null);
    setEmpresaId(null);
    setResultados([]);
    setBuscado(false);
  }

  function seleccionarHuesped(h: Huesped) {
    setHuespedId(h.id);
    setEmpresaId(null);
    setNombres(h.nombres);
    setApellidos(h.apellidos);
    setTelefono(h.telefono ?? '');
    setCorreo(h.correo ?? '');
    setHuespedRuc(h.ruc ?? '');
    setHuespedRazonSocial(h.razon_social ?? '');
    setResultados([]);
  }

  function seleccionarEmpresa(e: Empresa) {
    setEmpresaId(e.id);
    setHuespedId(null);
    setRazonSocial(e.razon_social);
    setRucEmpresa(e.ruc);
    setResultados([]);
  }

  function elegirResultado(r: ResultadoCliente) {
    if (r.tipo === 'huesped') seleccionarHuesped(r.data);
    else seleccionarEmpresa(r.data);
  }

  // Busca en este orden: RUC exacto (11 dígitos) -- primero como atributo
  // del propio huésped (`huespedes.ruc`, es lo normal: en el hotel siempre
  // se hospedan personas, el RUC es solo un dato de facturación suyo), y
  // solo si no hay huésped con ese RUC se prueba contra la tabla `empresas`
  // (reservada para tarifas corporativas negociadas, un caso aparte) ->
  // documento exacto de huésped -> si no hubo match exacto, nombre parcial
  // (LIKE) sobre huéspedes Y razón social parcial sobre empresas a la vez
  // -- a veces el cliente solo da su nombre/apellido por teléfono, y puede
  // haber varias coincidencias para elegir.
  async function buscarCliente() {
    const q = busqueda.trim();
    if (!q) return;
    setBuscando(true);
    setError(null);
    setHuespedId(null);
    setEmpresaId(null);
    setResultados([]);
    try {
      if (/^\d{11}$/.test(q)) {
        const huespedPorRuc = await buscarHuespedPorRuc(hotelId, q);
        if (huespedPorRuc) {
          seleccionarHuesped(huespedPorRuc);
          return;
        }
        const empresa = await buscarEmpresaPorRuc(hotelId, q);
        if (empresa) {
          seleccionarEmpresa(empresa);
          return;
        }
      }

      const huesped = await buscarHuespedPorDni(hotelId, q);
      if (huesped) {
        seleccionarHuesped(huesped);
        return;
      }

      const [huespedes, empresas] = await Promise.all([
        buscarHuespedesPorNombre(hotelId, q),
        buscarEmpresasPorNombre(hotelId, q),
      ]);
      const combinados: ResultadoCliente[] = [
        ...huespedes.map((h): ResultadoCliente => ({ tipo: 'huesped', data: h })),
        ...empresas.map((e): ResultadoCliente => ({ tipo: 'empresa', data: e })),
      ];
      if (combinados.length === 1) {
        elegirResultado(combinados[0]);
      } else if (combinados.length > 1) {
        setResultados(combinados);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el cliente');
    } finally {
      setBuscando(false);
      setBuscado(true);
    }
  }

  // Solo con esto en true se habilitan los campos para escribir a mano los
  // datos de un huésped nuevo: hay que buscar primero (Enter) y que
  // realmente no aparezca nadie, para no dejar pasar sin querer un
  // duplicado de alguien que ya está registrado.
  const sinResultados = buscado && !huespedId && !empresaId && resultados.length === 0;

  const checkoutCalculado = calcularCheckout(fecha, hora, dias);
  const cobroMascotaTotal = conMascota ? precioMascotaDia * dias : 0;
  const importeTotal = tarifaDia * dias + cobroMascotaTotal;
  const excedeAforo = aforoMax > 0 && nroPersonas > aforoMax;
  const totalAnticipos = anticiposExistentes.reduce((acc, a) => acc + Number(a.monto), 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const checkinISO = new Date(`${fecha}T${hora}:00`).toISOString();
      const checkoutISO = checkoutCalculado?.toISOString();
      if (!checkoutISO) throw new Error('Fecha/hora de check-in inválida');

      const anticipoMontoNum = anticipoMonto === '' ? undefined : Number(anticipoMonto);

      if (modo === 'crear') {
        let idHuesped = huespedId;
        let idEmpresa = empresaId;
        if (!idHuesped && !idEmpresa) {
          if (!sinResultados) {
            throw new Error('Busca al cliente (Enter) antes de guardar; si no aparece, podrás completar sus datos.');
          }
          if (!nombres.trim() || !apellidos.trim()) {
            throw new Error('Completa nombres y apellidos para registrar al huésped');
          }
          const creado = await crearHuesped(hotelId, {
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            tipoDoc: 'dni',
            nroDoc: busqueda.trim(),
            telefono: telefono.trim() || undefined,
            correo: correo.trim() || undefined,
            ruc: huespedRuc.trim() || undefined,
            razonSocial: huespedRazonSocial.trim() || undefined,
          });
          idHuesped = creado.id;
        }

        await api.post(`/hoteles/${hotelId}/reservas`, {
          huespedId: idEmpresa ? undefined : idHuesped,
          empresaId: idEmpresa ?? undefined,
          origen,
          moneda,
          habitaciones: [
            {
              habitacionId,
              nroPersonas,
              tipoAlquiler: 'pernocte',
              checkinPrevisto: checkinISO,
              checkoutPrevisto: checkoutISO,
              tarifaDiaManual: tarifaDia,
              diasManual: dias,
              incluyeDesayuno,
              conMascota,
              observaciones: observaciones.trim() || undefined,
              vehiculoMarca: tieneVehiculo ? vehiculoMarca.trim() || undefined : undefined,
              vehiculoTipo: tieneVehiculo ? vehiculoTipo.trim() || undefined : undefined,
              vehiculoPlaca: tieneVehiculo ? vehiculoPlaca.trim() || undefined : undefined,
            },
          ],
          anticipoMonto: anticipoMontoNum,
          anticipoMetodoPago: anticipoMontoNum ? anticipoMetodoPago : undefined,
        });
      } else {
        await api.patch(`/hoteles/${hotelId}/reservas/${reservaId}/habitaciones/${lineaId}`, {
          origen,
          moneda,
          nroPersonas,
          incluyeDesayuno,
          conMascota,
          checkinPrevisto: checkinISO,
          diasManual: dias,
          tarifaDiaManual: tarifaDia,
          observaciones: observaciones.trim() || undefined,
          vehiculoMarca: tieneVehiculo ? vehiculoMarca.trim() || undefined : undefined,
          vehiculoTipo: tieneVehiculo ? vehiculoTipo.trim() || undefined : undefined,
          vehiculoPlaca: tieneVehiculo ? vehiculoPlaca.trim() || undefined : undefined,
          anticipoMonto: anticipoMontoNum,
          anticipoMetodoPago: anticipoMontoNum ? anticipoMetodoPago : undefined,
        });
      }
      onGuardado();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'No se pudo guardar la reserva');
    } finally {
      setEnviando(false);
    }
  }

  async function anularReserva() {
    if (!reservaId) return;
    setAnulando(true);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/reservas/${reservaId}/cancelar`, {
        motivo: motivoAnulacion.trim() || undefined,
      });
      onGuardado();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo anular la reserva');
    } finally {
      setAnulando(false);
    }
  }

  // Convierte esta línea de reserva en una estadía real (copia sus datos y
  // anticipos): solo el día que corresponde y con la habitación libre, lo
  // valida el backend. Lo que falte se termina de editar ya en
  // EstadiaDetalle.tsx, no aquí.
  async function hacerCheckin() {
    if (!lineaId) return;
    setHaciendoCheckin(true);
    setError(null);
    try {
      const estadia = await api.post<{ id: string }>(`/hoteles/${hotelId}/estadias/checkin`, {
        reservaHabitacionId: lineaId,
      });
      onGuardado();
      onClose();
      navigate(`/estadias/${estadia.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo hacer el check-in');
    } finally {
      setHaciendoCheckin(false);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>
            {modo === 'crear' ? 'Nueva reserva' : 'Editar reserva'} · Habitación {habNumero}
          </h2>
          {modo === 'editar' && !cargando && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {reservaEstado === 'confirmada' && (
                <button
                  type="button"
                  onClick={hacerCheckin}
                  disabled={haciendoCheckin}
                  style={btnPrimary}
                >
                  {haciendoCheckin ? 'Procesando...' : 'Hacer check-in'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setMostrarAnular((v) => !v)}
                style={{ ...btnSecondary, color: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                Anular reserva
              </button>
            </div>
          )}
        </div>

        {mostrarAnular && (
          <div
            style={{
              ...cardStyle,
              borderColor: 'var(--danger)',
              marginBottom: 16,
            }}
          >
            <p style={cardTitleStyle}>Anular reserva</p>
            {totalAnticipos > 0 && (
              <p style={{ fontSize: 12, color: 'var(--danger)', margin: '0 0 8px' }}>
                ⚠ Esta reserva tiene {moneda} {totalAnticipos.toFixed(2)} en anticipos registrados.
                Aun así se puede anular.
              </p>
            )}
            <label style={labelStyle}>Motivo de la anulación (opcional)</label>
            <textarea
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              placeholder="Ej. El cliente no se presentó"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => setMostrarAnular(false)} style={btnSecondary}>
                Volver
              </button>
              <button
                type="button"
                onClick={anularReserva}
                disabled={anulando}
                style={{ ...btnPrimary, background: 'var(--danger)' }}
              >
                {anulando ? 'Anulando...' : 'Confirmar anulación'}
              </button>
            </div>
          </div>
        )}

        {cargando ? (
          <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

            {/* ---------- Cliente ---------- */}
            <div style={cardStyle}>
              <p style={cardTitleStyle}>Cliente</p>
              {modo === 'crear' ? (
                <div>
                  <label style={labelStyle}>DNI, RUC (empresa) o nombre del cliente</label>
                  <input
                    value={busqueda}
                    onChange={(e) => {
                      setBusqueda(e.target.value);
                      limpiarSeleccionCliente();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        buscarCliente();
                      }
                    }}
                    placeholder="Ej. 45678912, 20601234567 o RIOS — Enter para buscar"
                    style={inputStyle}
                    required={!huespedId && !empresaId}
                  />
                  {buscando && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Buscando...</p>
                  )}

                  {huespedId && (
                    <p style={{ fontSize: 11, color: 'var(--disponible)', margin: '6px 0 0' }}>
                      Huésped encontrado — sus datos se muestran abajo. Si hay que corregir algo de su ficha, hazlo
                      desde el módulo Huéspedes (puede estar compartida con otras reservas).
                    </p>
                  )}
                  {empresaId && (
                    <p style={{ fontSize: 11, color: 'var(--disponible)', margin: '6px 0 0' }}>
                      Empresa encontrada: {razonSocial} · RUC {rucEmpresa}
                    </p>
                  )}
                  {sinResultados && (
                    <p style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, margin: '6px 0 0' }}>
                      No se encontró ningún cliente con ese dato — completa los datos abajo para registrarlo como
                      huésped nuevo (son provisionales; el número de documento se confirma obligatoriamente en el
                      check-in).
                    </p>
                  )}
                  {!buscado && !huespedId && !empresaId && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                      Busca primero (Enter) — si no aparece nadie, se habilitan los campos de abajo para registrarlo.
                    </p>
                  )}

                  {resultados.length > 0 && (
                    <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, padding: '6px 10px', background: 'var(--surface-2)' }}>
                        {resultados.length} coincidencia(s) — elige una:
                      </p>
                      {resultados.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => elegirResultado(r)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 10px',
                            background: 'transparent',
                            border: 'none',
                            borderTop: '1px solid var(--border)',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {r.tipo === 'huesped' ? (
                            <>
                              {r.data.nombres} {r.data.apellidos}{' '}
                              <span style={{ color: 'var(--text-muted)' }}>· {r.data.nro_doc}</span>
                            </>
                          ) : (
                            <>
                              {r.data.razon_social} <span style={{ color: 'var(--text-muted)' }}>· Empresa · RUC {r.data.ruc}</span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {!empresaId && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <div>
                        <label style={labelStyle}>Nombres</label>
                        <input
                          value={nombres}
                          onChange={(e) => setNombres(e.target.value)}
                          style={inputStyle}
                          disabled={!sinResultados}
                          required={sinResultados}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Apellidos</label>
                        <input
                          value={apellidos}
                          onChange={(e) => setApellidos(e.target.value)}
                          style={inputStyle}
                          disabled={!sinResultados}
                          required={sinResultados}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Teléfono</label>
                        <input
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          style={inputStyle}
                          disabled={!sinResultados}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Correo</label>
                        <input
                          type="email"
                          value={correo}
                          onChange={(e) => setCorreo(e.target.value)}
                          style={inputStyle}
                          disabled={!sinResultados}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>RUC (opcional)</label>
                        <input
                          value={huespedRuc}
                          onChange={(e) => setHuespedRuc(e.target.value)}
                          placeholder="11 dígitos"
                          maxLength={11}
                          style={inputStyle}
                          disabled={!sinResultados}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Razón social (empresa, opcional)</label>
                        <input
                          value={huespedRazonSocial}
                          onChange={(e) => setHuespedRazonSocial(e.target.value)}
                          style={inputStyle}
                          disabled={!sinResultados}
                        />
                      </div>
                      {sinResultados && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', gridColumn: '1 / -1', margin: 0 }}>
                          Se registrará como huésped nuevo usando "{busqueda.trim()}" como documento. RUC y razón
                          social: del propio huésped si pidió factura a su nombre, o de la empresa que paga su
                          estadía. Déjalo vacío si no aplica.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  {huespedNombre ?? 'Sin datos de cliente'}
                </p>
              )}
            </div>

            {/* ---------- Datos de la reserva + Fechas ---------- */}
            <div style={gridRowStyle}>
              <div style={cardStyle}>
                <p style={cardTitleStyle}>Datos de la reserva</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={labelStyle}>Origen</label>
                    <select value={origen} onChange={(e) => setOrigen(e.target.value)} style={inputStyle}>
                      {ORIGENES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ width: 110 }}>
                    <label style={labelStyle}>Moneda</label>
                    <select value={moneda} onChange={(e) => setMoneda(e.target.value as 'PEN' | 'USD')} style={inputStyle}>
                      <option value="PEN">PEN</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  <div style={{ width: 110 }}>
                    <label style={labelStyle}>N° personas</label>
                    <input
                      type="number"
                      min={1}
                      value={nroPersonas}
                      onChange={(e) => setNroPersonas(Number(e.target.value))}
                      style={{ ...inputStyle, ...(excedeAforo ? { borderColor: 'var(--danger)' } : {}) }}
                      required
                    />
                  </div>
                </div>
                <p style={{ fontSize: 11, color: excedeAforo ? 'var(--danger)' : 'var(--text-muted)', margin: '6px 0 0' }}>
                  {aforoMax > 0
                    ? `Aforo máximo de esta habitación: ${aforoMax} persona(s)${excedeAforo ? ' — supera la referencia' : ''}`
                    : 'Sin aforo máximo configurado para este tipo de habitación'}
                </p>
              </div>

              <div style={cardStyle}>
                <p style={cardTitleStyle}>Fechas y estancia</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <label style={labelStyle}>Chk In (fecha)</label>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} required />
                  </div>
                  <div style={{ width: 110 }}>
                    <label style={labelStyle}>Hora ingreso</label>
                    <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={inputStyle} required />
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
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                  Chk out (calculado): {checkoutCalculado ? checkoutCalculado.toLocaleString('es-PE') : '—'}
                </p>
              </div>
            </div>

            {/* ---------- Servicios + Vehículo ---------- */}
            <div style={gridRowStyle}>
              <div style={cardStyle}>
                <p style={cardTitleStyle}>Servicios adicionales</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}>
                  <input type="checkbox" checked={incluyeDesayuno} onChange={(e) => setIncluyeDesayuno(e.target.checked)} />
                  Incluye desayuno (cortesía, no se cobra)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: conMascota ? 6 : 0 }}>
                  <input type="checkbox" checked={conMascota} onChange={(e) => setConMascota(e.target.checked)} />
                  Viene con mascota
                </label>
                {conMascota && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                    {precioMascotaDia > 0
                      ? `Cobro: S/. ${precioMascotaDia.toFixed(2)}/día × ${dias} día(s) = S/. ${cobroMascotaTotal.toFixed(2)} (se cobra al check-in)`
                      : 'Este hotel no tiene configurado un cobro por mascota (Configuración → Hotel).'}
                  </p>
                )}
              </div>

              <div style={cardStyle}>
                <p style={cardTitleStyle}>Vehículo</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: tieneVehiculo ? 8 : 0 }}>
                  <input type="checkbox" checked={tieneVehiculo} onChange={(e) => setTieneVehiculo(e.target.checked)} />
                  El huésped tiene vehículo
                </label>
                {tieneVehiculo && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={labelStyle}>Marca</label>
                      <input value={vehiculoMarca} onChange={(e) => setVehiculoMarca(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={labelStyle}>Tipo</label>
                      <input
                        value={vehiculoTipo}
                        onChange={(e) => setVehiculoTipo(e.target.value)}
                        placeholder="Auto, camioneta..."
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <label style={labelStyle}>Placa</label>
                      <input value={vehiculoPlaca} onChange={(e) => setVehiculoPlaca(e.target.value)} style={inputStyle} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ---------- Tarifa + Observaciones ---------- */}
            <div style={gridRowStyle}>
              <div style={cardStyle}>
                <p style={cardTitleStyle}>Tarifa</p>
                <div style={{ width: 150 }}>
                  <label style={labelStyle}>Tarifa/día ({moneda})</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={tarifaDia}
                    onChange={(e) => setTarifaDia(Number(e.target.value))}
                    style={inputStyle}
                    required
                  />
                </div>
                <div
                  style={{
                    marginTop: 10,
                    background: 'var(--surface-2)',
                    borderRadius: 'var(--radius)',
                    padding: '10px 12px',
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                    Importe total: {moneda} {importeTotal.toFixed(2)}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Tarifa × días{conMascota ? ' + cobro de mascota' : ''}
                  </p>
                </div>
              </div>

              <div style={cardStyle}>
                <p style={cardTitleStyle}>Observaciones</p>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Notas de esta reserva (pedidos especiales, referencias, etc.)"
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            </div>

            {/* ---------- Anticipo ---------- */}
            <div style={cardStyle}>
              <p style={cardTitleStyle}>Pago adelantado (anticipo, opcional)</p>
              {anticiposExistentes.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {anticiposExistentes.map((a) => (
                    <p key={a.id} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 2px' }}>
                      {moneda} {Number(a.monto).toFixed(2)} ({a.metodo_pago}) · {new Date(a.fecha).toLocaleDateString('es-PE')}
                    </p>
                  ))}
                  <p style={{ fontSize: 12, fontWeight: 600, margin: '4px 0 0' }}>
                    Total anticipado: {moneda} {totalAnticipos.toFixed(2)}
                  </p>
                </div>
              )}
              <div>
                <label style={labelStyle}>
                  {anticiposExistentes.length > 0 ? 'Agregar otro anticipo' : 'Monto'} ({moneda})
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ width: 150 }}>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={anticipoMonto}
                      onChange={(e) => setAnticipoMonto(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  {anticipoMonto !== '' && Number(anticipoMonto) > 0 && (
                    <div style={{ width: 160 }}>
                      <label style={labelStyle}>Método de pago</label>
                      <select value={anticipoMetodoPago} onChange={(e) => setAnticipoMetodoPago(e.target.value)} style={inputStyle}>
                        {METODOS_PAGO.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                  Si es efectivo, entra a la caja de tu turno abierto ahora. Se enlaza como pago a la estadía real
                  cuando el huésped haga check-in. Se guarda al hacer clic en "Guardar".
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={onClose} style={btnSecondary}>
                Cancelar
              </button>
              <button type="submit" disabled={enviando} style={btnPrimary}>
                {enviando ? 'Guardando...' : 'Guardar'}
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
