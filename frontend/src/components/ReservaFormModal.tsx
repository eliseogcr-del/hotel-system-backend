import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import {
  buscarHuespedPorDni,
  buscarHuespedesPorNombre,
  buscarEmpresaPorRuc,
  crearHuesped,
  type Huesped,
  type Empresa,
} from '../lib/huespedes';

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

interface ReservaDetalle {
  id: string;
  origen: string;
  moneda: 'PEN' | 'USD';
  anticipo_monto: number;
  anticipo_metodo_pago: string | null;
  huespedes: { nombres: string; apellidos: string } | null;
  empresas: { razon_social: string } | null;
  reserva_habitacion: ReservaHabitacionDetalle[];
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
  reservaId,
  lineaId,
  onClose,
  onGuardado,
}: Props) {
  const [cargando, setCargando] = useState(modo === 'editar');
  const [huespedNombre, setHuespedNombre] = useState<string | null>(null);

  // Cliente (solo modo 'crear'): DNI/RUC exacto o nombre parcial. Puede
  // resolver a un huésped, a una empresa, a varias coincidencias por
  // nombre (para elegir) o a "no existe, completa los datos".
  const [busqueda, setBusqueda] = useState('');
  const [huespedId, setHuespedId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [resultadosNombre, setResultadosNombre] = useState<Huesped[]>([]);
  const [buscado, setBuscado] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const [observaciones, setObservaciones] = useState('');

  const [origen, setOrigen] = useState('directo');
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN');
  const [fecha, setFecha] = useState(fechaInicial || hoyYMD());
  const [hora, setHora] = useState(horaActual());
  const [dias, setDias] = useState(1);
  const [nroPersonas, setNroPersonas] = useState(2);
  const [incluyeDesayuno, setIncluyeDesayuno] = useState(false);
  const [conMascota, setConMascota] = useState(false);
  const [tieneVehiculo, setTieneVehiculo] = useState(false);
  const [vehiculoMarca, setVehiculoMarca] = useState('');
  const [vehiculoTipo, setVehiculoTipo] = useState('');
  const [vehiculoPlaca, setVehiculoPlaca] = useState('');
  const [tarifaDia, setTarifaDia] = useState(tarifaSugerida);

  const [anticipoYaRegistrado, setAnticipoYaRegistrado] = useState<{
    monto: number;
    metodo: string | null;
  } | null>(null);
  const [anticipoMonto, setAnticipoMonto] = useState('');
  const [anticipoMetodoPago, setAnticipoMetodoPago] = useState('efectivo');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (modo !== 'editar' || !reservaId) return;
    api
      .get<ReservaDetalle>(`/hoteles/${hotelId}/reservas/${reservaId}`)
      .then((reserva) => {
        const linea = reserva.reserva_habitacion.find((l) => l.id === lineaId);
        setOrigen(reserva.origen);
        setMoneda(reserva.moneda);
        setHuespedNombre(
          reserva.huespedes
            ? `${reserva.huespedes.nombres} ${reserva.huespedes.apellidos}`
            : (reserva.empresas?.razon_social ?? null),
        );
        if (Number(reserva.anticipo_monto) > 0) {
          setAnticipoYaRegistrado({
            monto: Number(reserva.anticipo_monto),
            metodo: reserva.anticipo_metodo_pago,
          });
        }
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
    setResultadosNombre([]);
    setBuscado(false);
  }

  function seleccionarHuesped(h: Huesped) {
    setHuespedId(h.id);
    setEmpresaId(null);
    setNombres(h.nombres);
    setApellidos(h.apellidos);
    setResultadosNombre([]);
  }

  function seleccionarEmpresa(e: Empresa) {
    setEmpresaId(e.id);
    setHuespedId(null);
    setRazonSocial(e.razon_social);
    setResultadosNombre([]);
  }

  // Busca en este orden: RUC exacto de empresa (11 dígitos) -> documento
  // exacto de huésped -> si no hubo match exacto, nombre parcial (LIKE)
  // sobre huéspedes -- a veces el cliente solo da su nombre o apellido por
  // teléfono, y puede haber varias coincidencias para elegir.
  async function buscarCliente() {
    const q = busqueda.trim();
    if (!q) return;
    setBuscando(true);
    setError(null);
    setHuespedId(null);
    setEmpresaId(null);
    setResultadosNombre([]);
    try {
      if (/^\d{11}$/.test(q)) {
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

      const resultados = await buscarHuespedesPorNombre(hotelId, q);
      if (resultados.length === 1) {
        seleccionarHuesped(resultados[0]);
      } else if (resultados.length > 1) {
        setResultadosNombre(resultados);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo buscar el cliente');
    } finally {
      setBuscando(false);
      setBuscado(true);
    }
  }

  const sinResultados = buscado && !huespedId && !empresaId && resultadosNombre.length === 0;

  const checkoutCalculado = calcularCheckout(fecha, hora, dias);
  const cobroMascotaTotal = conMascota ? precioMascotaDia * dias : 0;
  const importeTotal = tarifaDia * dias + cobroMascotaTotal;
  const excedeAforo = aforoMax > 0 && nroPersonas > aforoMax;

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
          if (!nombres.trim() || !apellidos.trim() || !busqueda.trim()) {
            throw new Error('Busca o completa nombres y apellidos para registrar al huésped');
          }
          const creado = await crearHuesped(hotelId, {
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            tipoDoc: 'dni',
            nroDoc: busqueda.trim(),
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
          anticipoMonto: !anticipoYaRegistrado ? anticipoMontoNum : undefined,
          anticipoMetodoPago: !anticipoYaRegistrado && anticipoMontoNum ? anticipoMetodoPago : undefined,
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

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h2 style={{ fontSize: 17, marginBottom: 16 }}>
          {modo === 'crear' ? 'Nueva reserva' : 'Editar reserva'} · Habitación {habNumero}
        </h2>

        {cargando ? (
          <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

            {modo === 'crear' ? (
              <div>
                <label style={labelStyle}>DNI, RUC (empresa) o nombre del cliente</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <input
                    value={busqueda}
                    onChange={(e) => {
                      setBusqueda(e.target.value);
                      limpiarSeleccionCliente();
                    }}
                    placeholder="Ej. 45678912, 20601234567 o RIOS"
                    style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                    required={!huespedId && !empresaId}
                  />
                  <button type="button" onClick={buscarCliente} disabled={buscando || !busqueda.trim()} style={btnSecondary}>
                    {buscando ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>

                {huespedId && (
                  <p style={{ fontSize: 11, color: 'var(--disponible)', margin: '4px 0 0' }}>
                    Huésped encontrado: {nombres} {apellidos}
                  </p>
                )}
                {empresaId && (
                  <p style={{ fontSize: 11, color: 'var(--disponible)', margin: '4px 0 0' }}>
                    Empresa encontrada: {razonSocial}
                  </p>
                )}

                {resultadosNombre.length > 0 && (
                  <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, padding: '6px 10px', background: 'var(--surface-1)' }}>
                      {resultadosNombre.length} coincidencia(s) — elige una:
                    </p>
                    {resultadosNombre.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => seleccionarHuesped(h)}
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
                        {h.nombres} {h.apellidos} <span style={{ color: 'var(--text-muted)' }}>· {h.nro_doc}</span>
                      </button>
                    ))}
                  </div>
                )}

                {sinResultados && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', width: '100%', margin: 0 }}>
                      No se encontró: completa los datos para registrar un huésped nuevo (usará "{busqueda.trim()}" como documento).
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
                )}
              </div>
            ) : (
              huespedNombre && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Huésped: {huespedNombre}</p>
              )
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={labelStyle}>Origen de la reserva</label>
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
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={labelStyle}>Chk In (fecha)</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} required />
              </div>
              <div style={{ width: 120 }}>
                <label style={labelStyle}>Hora ingreso</label>
                <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={inputStyle} required />
              </div>
              <div style={{ width: 90 }}>
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
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-8px 0 0' }}>
              Chk out (calculado): {checkoutCalculado ? checkoutCalculado.toLocaleString('es-PE') : '—'}
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ width: 130 }}>
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
              <p style={{ fontSize: 11, color: excedeAforo ? 'var(--danger)' : 'var(--text-muted)', margin: 0 }}>
                {aforoMax > 0
                  ? `Aforo máximo de esta habitación: ${aforoMax} persona(s)${excedeAforo ? ' — supera la referencia' : ''}`
                  : 'Sin aforo máximo configurado para este tipo de habitación'}
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={incluyeDesayuno} onChange={(e) => setIncluyeDesayuno(e.target.checked)} />
              Incluye desayuno (cortesía, no se cobra)
            </label>

            <div>
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

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
                <input type="checkbox" checked={tieneVehiculo} onChange={(e) => setTieneVehiculo(e.target.checked)} />
                El huésped tiene vehículo
              </label>
              {tieneVehiculo && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ width: 150 }}>
                    <label style={labelStyle}>Marca</label>
                    <input value={vehiculoMarca} onChange={(e) => setVehiculoMarca(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ width: 130 }}>
                    <label style={labelStyle}>Tipo</label>
                    <input
                      value={vehiculoTipo}
                      onChange={(e) => setVehiculoTipo(e.target.value)}
                      placeholder="Auto, camioneta..."
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ width: 130 }}>
                    <label style={labelStyle}>Placa</label>
                    <input value={vehiculoPlaca} onChange={(e) => setVehiculoPlaca(e.target.value)} style={inputStyle} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Observaciones</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas de esta reserva (pedidos especiales, referencias, etc.)"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
            </div>

            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                Importe total: {moneda} {importeTotal.toFixed(2)}
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Tarifa × días{conMascota ? ' + cobro de mascota' : ''}
              </p>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />

            {anticipoYaRegistrado ? (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Anticipo ya registrado: {moneda} {anticipoYaRegistrado.monto.toFixed(2)}
                {anticipoYaRegistrado.metodo ? ` (${anticipoYaRegistrado.metodo})` : ''}
              </p>
            ) : (
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Pago adelantado (anticipo, opcional)</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ width: 150 }}>
                    <label style={labelStyle}>Monto ({moneda})</label>
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
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Si es efectivo, entra a la caja de tu turno abierto ahora. Se enlaza como pago a la estadía real
                  cuando el huésped haga check-in.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
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
  maxWidth: 560,
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
