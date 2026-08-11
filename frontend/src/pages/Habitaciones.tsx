import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { CheckinRapidoModal } from '../components/CheckinRapidoModal';

type Vista = 'tabla' | 'tarjetas';

type Estado = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' | 'bloqueada';

interface Habitacion {
  id: string;
  hab_numero: number;
  piso: number;
  estado: Estado;
  mantenimiento_planificado: boolean;
  tareaHkEnProceso: { tipo: 'limpieza' | 'mantenimiento'; notas: string | null } | null;
  tipos_habitacion: { id: string; nombre: string } | null;
  estadiaId: string | null;
  huesped: string | null;
  checkinReal: string | null;
  checkoutPrevisto: string | null;
  tarifaDia: number | null;
  totalAlquiler: number | null;
  totalOtrosServicios: number | null;
  totalPagado: number | null;
  saldo: number | null;
  notas: string | null;
}

interface TipoHabitacionPrecios {
  id: string;
  precio_normal: number;
  precio_corporativo: number;
  precio_web: number;
  precio_por_hora: number | null;
  precio_costo: number;
}

interface Cochera {
  id: string;
  numero: string;
  tamano: string;
  tipo_vehiculo_permitido: string | null;
  estado: 'disponible' | 'ocupada';
  es_externa: boolean;
  precio_externa: number;
  ocupante: {
    habNumero: number | null;
    huesped: string | null;
    vehiculo: { marca: string | null; tipo: string | null; placa: string | null } | null;
  } | null;
}

const ESTADO_LABEL: Record<Estado, string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
  limpieza: 'Limpieza',
  mantenimiento: 'Mantenimiento',
  bloqueada: 'Bloqueada',
};

const ESTADO_COCHERA_LABEL: Record<Cochera['estado'], string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
};

function formatoFechaHora(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function formatoMonto(n: number | null) {
  if (n == null) return '—';
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Habitaciones() {
  const { hotelActual } = useHotel();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [habitaciones, setHabitaciones] = useState<Habitacion[]>([]);
  const [tiposHabitacion, setTiposHabitacion] = useState<TipoHabitacionPrecios[]>([]);
  const [cocheras, setCocheras] = useState<Cochera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(new Date());
  const [checkinHab, setCheckinHab] = useState<Habitacion | null>(null);
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem('habitaciones_vista') as Vista | null) ?? 'tabla',
  );

  function cambiarVista(v: Vista) {
    setVista(v);
    localStorage.setItem('habitaciones_vista', v);
  }

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function cargar() {
    if (!hotelActual) return;
    setLoading(true);
    setError(null);
    // Sin cron real en el backend: cada vez que se abre/recarga este panel
    // se le pide al backend que primero extienda automáticamente las
    // estadías cuya salida programada ya venció hace más de 1 hora sin
    // checkout ni ampliación, para que la lista que sigue ya salga al día.
    // Si falla, no se bloquea la carga normal del panel por esto.
    await api.post(`/hoteles/${hotelActual.hotelId}/estadias/procesar-salidas-vencidas`).catch(() => {});

    api
      .get<Habitacion[]>(`/hoteles/${hotelActual.hotelId}/habitaciones`)
      .then(setHabitaciones)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false));
    api
      .get<TipoHabitacionPrecios[]>(`/hoteles/${hotelActual.hotelId}/tipos-habitacion`)
      .then(setTiposHabitacion)
      .catch(() => {});
    api
      .get<Cochera[]>(`/hoteles/${hotelActual.hotelId}/cocheras`)
      .then(setCocheras)
      .catch(() => {});
  }

  useEffect(() => {
    cargar();
  }, [hotelActual]);

  async function guardarNotas(hab: Habitacion, notas: string) {
    if (!hotelActual || !hab.estadiaId) return;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/estadias/${hab.estadiaId}/notas`, { notas });
      setHabitaciones((prev) => prev.map((h) => (h.id === hab.id ? { ...h, notas } : h)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar las notas');
    }
  }

  async function alternarMantenimientoPlanificado(hab: Habitacion) {
    if (!hotelActual || hab.estado !== 'ocupada') return;
    const nuevo = !hab.mantenimiento_planificado;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/habitaciones/${hab.id}/mantenimiento`, {
        activar: nuevo,
      });
      setHabitaciones((prev) =>
        prev.map((h) => (h.id === hab.id ? { ...h, mantenimiento_planificado: nuevo } : h)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  async function marcarDisponible(hab: Habitacion) {
    if (!hotelActual) return;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/habitaciones/${hab.id}/marcar-disponible`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar disponible');
    }
  }

  function preciosDe(tipoId: string | undefined): TipoHabitacionPrecios | null {
    if (!tipoId) return null;
    return tiposHabitacion.find((t) => t.id === tipoId) ?? null;
  }

  function etiquetaEstado(h: Habitacion): string {
    if (h.tareaHkEnProceso?.tipo === 'limpieza' && h.estado === 'limpieza') return 'En proceso de limpieza';
    if (h.tareaHkEnProceso?.tipo === 'mantenimiento' && h.estado === 'ocupada') return 'En proceso de mantenimiento';
    return ESTADO_LABEL[h.estado];
  }

  if (!hotelActual) return <p style={{ color: 'var(--text-muted)' }}>Cargando hotel...</p>;
  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Cargando habitaciones...</p>;
  if (error && habitaciones.length === 0) return <p style={{ color: 'var(--danger)' }}>{error}</p>;

  return (
    <div>
      <div
        style={
          isMobile
            ? { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }
            : { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', marginBottom: 16 }
        }
      >
        <h1 style={{ fontSize: 20 }}>Habitaciones</h1>
        <span
          style={{
            fontSize: isMobile ? 13 : 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            textAlign: isMobile ? 'left' : 'center',
          }}
        >
          {ahora.toLocaleString('es-PE', { dateStyle: isMobile ? 'medium' : 'full', timeStyle: 'medium' })}
        </span>
        {!isMobile && <span />}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
          {(Object.keys(ESTADO_LABEL) as Estado[]).map((estado) => (
            <span key={estado} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: `var(--${estado})`,
                  display: 'inline-block',
                }}
              />
              {ESTADO_LABEL[estado]}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <button
            onClick={() => cambiarVista('tabla')}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
              background: vista === 'tabla' ? 'var(--brand)' : 'var(--surface-1)',
              color: vista === 'tabla' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            Tabla
          </button>
          <button
            onClick={() => cambiarVista('tarjetas')}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
              background: vista === 'tarjetas' ? 'var(--brand)' : 'var(--surface-1)',
              color: vista === 'tarjetas' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            Tarjetas
          </button>
        </div>
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {vista === 'tabla' && (
      <>
      <div
        style={{
          overflow: 'auto',
          maxHeight: isMobile ? 'calc(100vh - 300px)' : 'calc(100vh - 260px)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1400 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
              <th style={thStyle}>Acciones</th>
              <th style={thStyle}>N°</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Huésped</th>
              <th style={thStyle}>Check-in real</th>
              <th style={thStyle}>Salida programada</th>
              <th style={thStyle}>Alquiler</th>
              <th style={thStyle}>Otros servicios</th>
              <th style={thStyle}>Pagado</th>
              <th style={thStyle}>Adeudado</th>
              <th style={thStyle}>Tarifa/día</th>
              <th style={thStyle}>Notas</th>
              <th style={{ ...thStyle, borderRight: 'none' }}>¿Mantenim.?</th>
            </tr>
          </thead>
          <tbody>
            {habitaciones.map((h, i) => (
              <tr
                key={h.id}
                style={{
                  borderTop: '1px solid var(--border-strong)',
                  background: i % 2 === 1 ? 'var(--surface-1)' : 'transparent',
                }}
              >
                <td style={tdStyle}>
                  {h.estado === 'disponible' && (
                    <button onClick={() => setCheckinHab(h)} style={linkBtnStyle}>
                      Check-in
                    </button>
                  )}
                  {h.estado === 'ocupada' && h.estadiaId && (
                    <Link to={`/estadias/${h.estadiaId}`} style={linkBtnStyle}>
                      Check-out
                    </Link>
                  )}
                  {(h.estado === 'limpieza' || h.estado === 'mantenimiento') && (
                    <button
                      onClick={() => marcarDisponible(h)}
                      style={linkBtnStyle}
                      title="Usar solo si HK ya terminó pero se le olvidó cerrar la tarea"
                    >
                      Marcar disponible
                    </button>
                  )}
                </td>
                <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>{h.hab_numero}</td>
                <td style={tdStyle}>{h.tipos_habitacion?.nombre ?? '—'}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      background: `var(--${h.estado}-bg)`,
                      color: `var(--${h.estado}-text)`,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                    }}
                  >
                    {etiquetaEstado(h)}
                  </span>
                </td>
                <td style={tdStyle}>{h.huesped ?? ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoFechaHora(h.checkinReal) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoFechaHora(h.checkoutPrevisto) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalAlquiler) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalOtrosServicios) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalPagado) : ''}</td>
                <td
                  style={{
                    ...tdStyle,
                    ...(h.huesped && h.saldo != null && h.saldo > 0
                      ? { background: 'var(--ocupada-bg)', color: 'var(--ocupada-text)', fontWeight: 500 }
                      : {}),
                  }}
                >
                  {h.huesped ? formatoMonto(h.saldo) : ''}
                </td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.tarifaDia) : ''}</td>
                <td style={tdStyle}>
                  {h.huesped ? (
                    <NotasCelda notas={h.notas ?? ''} onGuardar={(n) => guardarNotas(h, n)} />
                  ) : h.tareaHkEnProceso?.notas ? (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {h.tareaHkEnProceso.notas}
                    </span>
                  ) : (
                    ''
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', borderRight: 'none' }}>
                  <input
                    type="checkbox"
                    checked={h.mantenimiento_planificado}
                    disabled={h.estado !== 'ocupada'}
                    title={h.estado !== 'ocupada' ? 'Solo se puede marcar mientras la habitación está ocupada' : ''}
                    onChange={() => alternarMantenimientoPlanificado(h)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {habitaciones.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No hay habitaciones registradas.</p>
      )}

      {cocheras.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Cocheras</h2>
          <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 700 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
                  <th style={thStyle}>N°</th>
                  <th style={thStyle}>Tamaño</th>
                  <th style={thStyle}>Tipo permitido</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Habitación</th>
                  <th style={thStyle}>Huésped</th>
                  <th style={{ ...thStyle, borderRight: 'none' }}>Vehículo</th>
                </tr>
              </thead>
              <tbody>
                {cocheras.map((c, i) => (
                  <tr
                    key={c.id}
                    style={{
                      borderTop: '1px solid var(--border-strong)',
                      background: i % 2 === 1 ? 'var(--surface-1)' : 'transparent',
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>{c.numero}</td>
                    <td style={tdStyle}>
                      {c.tamano}
                      {c.es_externa ? ' · externa' : ''}
                    </td>
                    <td style={tdStyle}>{c.tipo_vehiculo_permitido ?? '—'}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          background: `var(--${c.estado}-bg)`,
                          color: `var(--${c.estado}-text)`,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                        }}
                      >
                        {ESTADO_COCHERA_LABEL[c.estado]}
                      </span>
                    </td>
                    <td style={tdStyle}>{c.ocupante?.habNumero ?? ''}</td>
                    <td style={tdStyle}>{c.ocupante?.huesped ?? ''}</td>
                    <td style={{ ...tdStyle, borderRight: 'none' }}>
                      {c.ocupante?.vehiculo
                        ? [c.ocupante.vehiculo.marca, c.ocupante.vehiculo.tipo, c.ocupante.vehiculo.placa]
                            .filter(Boolean)
                            .join(' · ')
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {vista === 'tarjetas' && (
        <VistaTarjetas
          habitaciones={habitaciones}
          cocheras={cocheras}
          onClickHabitacion={(h) => {
            if (h.estado === 'disponible') setCheckinHab(h);
            else if (h.estado === 'ocupada' && h.estadiaId) navigate(`/estadias/${h.estadiaId}`);
          }}
          onClickCochera={(c) => {
            if (c.estado !== 'ocupada' || !c.ocupante?.habNumero) return;
            const hab = habitaciones.find((h) => h.hab_numero === c.ocupante!.habNumero);
            if (hab?.estadiaId) navigate(`/estadias/${hab.estadiaId}`);
          }}
          onGuardarNotas={guardarNotas}
        />
      )}

      {checkinHab && (
        <CheckinRapidoModal
          hotelId={hotelActual.hotelId}
          habitacionId={checkinHab.id}
          habNumero={checkinHab.hab_numero}
          precios={preciosDe(checkinHab.tipos_habitacion?.id)}
          onClose={() => setCheckinHab(null)}
          onCreado={cargar}
        />
      )}
    </div>
  );
}

function VistaTarjetas({
  habitaciones,
  cocheras,
  onClickHabitacion,
  onClickCochera,
  onGuardarNotas,
}: {
  habitaciones: Habitacion[];
  cocheras: Cochera[];
  onClickHabitacion: (h: Habitacion) => void;
  onClickCochera: (c: Cochera) => void;
  onGuardarNotas: (h: Habitacion, notas: string) => void;
}) {
  return (
    <div>
      <div style={tarjetasGridStyle}>
        {habitaciones.map((h) => {
          const clickable = h.estado === 'disponible' || (h.estado === 'ocupada' && !!h.estadiaId);
          const notasHk = h.huesped ? null : h.tareaHkEnProceso?.notas ?? null;
          return (
            <div
              key={h.id}
              onClick={() => clickable && onClickHabitacion(h)}
              style={{
                ...tarjetaStyle,
                background: `var(--${h.estado}-bg)`,
                border: `1px solid var(--${h.estado})`,
                cursor: clickable ? 'pointer' : 'default',
              }}
              title={clickable ? (h.estado === 'disponible' ? 'Hacer check-in' : 'Ver detalle') : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{h.hab_numero}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: `var(--${h.estado}-text)` }}>
                  {ESTADO_LABEL[h.estado]}
                </span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.tipos_habitacion?.nombre ?? '—'}</span>
              {h.huesped && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={h.huesped}
                >
                  {h.huesped}
                </span>
              )}
              {h.huesped && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: h.saldo != null && h.saldo > 0 ? 'var(--ocupada-text)' : 'var(--text-primary)',
                  }}
                >
                  Saldo: {h.saldo != null ? `S/. ${h.saldo.toFixed(2)}` : '—'}
                </span>
              )}
              {h.huesped && (
                <div onClick={(e) => e.stopPropagation()}>
                  <NotasCelda notas={h.notas ?? ''} onGuardar={(n) => onGuardarNotas(h, n)} tarjeta />
                </div>
              )}
              {notasHk && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={notasHk}
                >
                  {notasHk}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {habitaciones.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No hay habitaciones registradas.</p>
      )}

      {cocheras.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 10 }}>Cocheras</h2>
          <div style={tarjetasGridStyle}>
            {cocheras.map((c) => {
              const clickable = c.estado === 'ocupada' && !!c.ocupante?.habNumero;
              return (
                <div
                  key={c.id}
                  onClick={() => clickable && onClickCochera(c)}
                  style={{
                    ...tarjetaStyle,
                    background: `var(--${c.estado}-bg)`,
                    border: `1px solid var(--${c.estado})`,
                    cursor: clickable ? 'pointer' : 'default',
                    minHeight: 76,
                  }}
                  title={clickable ? 'Ver detalle' : undefined}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{c.numero}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: `var(--${c.estado}-text)` }}>
                      {ESTADO_COCHERA_LABEL[c.estado]}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.tamano}
                    {c.tipo_vehiculo_permitido ? ` · ${c.tipo_vehiculo_permitido}` : ''}
                    {c.es_externa ? ' · externa' : ''}
                  </span>
                  {c.ocupante && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Hab. {c.ocupante.habNumero} · {c.ocupante.huesped ?? '—'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const tarjetasGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
  gap: 12,
};

const tarjetaStyle: CSSProperties = {
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: 100,
};

function NotasCelda({
  notas,
  onGuardar,
  tarjeta,
}: {
  notas: string;
  onGuardar: (valor: string) => void;
  tarjeta?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(notas);

  useEffect(() => setValor(notas), [notas]);

  if (!editando) {
    return (
      <button
        onClick={() => setEditando(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          fontSize: tarjeta ? 11 : 12.5,
          fontStyle: tarjeta && notas ? 'italic' : undefined,
          color: notas ? (tarjeta ? 'var(--text-muted)' : 'var(--text-primary)') : 'var(--text-muted)',
          cursor: 'pointer',
          width: tarjeta ? '100%' : undefined,
          maxWidth: tarjeta ? undefined : 180,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'block',
        }}
        title={notas || 'Agregar nota'}
      >
        {notas || '+ nota'}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={() => {
        setEditando(false);
        if (valor !== notas) onGuardar(valor);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValor(notas);
          setEditando(false);
        }
      }}
      style={{
        width: tarjeta ? '100%' : 160,
        boxSizing: 'border-box',
        padding: '3px 6px',
        border: '1px solid var(--border-strong)',
        borderRadius: 4,
        fontSize: 12.5,
      }}
    />
  );
}

const thStyle: CSSProperties = {
  padding: '8px 10px',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--surface-1)',
  borderRight: '1px solid var(--border)',
  boxShadow: '0 1px 0 var(--border-strong)',
};
const tdStyle: CSSProperties = {
  padding: '8px 10px',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  borderRight: '1px solid var(--border)',
};

const linkBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--brand)',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'underline',
};
