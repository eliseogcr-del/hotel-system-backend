import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { CheckinRapidoModal } from '../components/CheckinRapidoModal';
import { ReservaFormModal } from '../components/ReservaFormModal';
import { colorPorOrigen, labelPorOrigen } from '../lib/colorOrigen';

type Vista = 'tabla' | 'tarjetas';

type Estado = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento' | 'bloqueada';

interface Habitacion {
  id: string;
  hab_numero: number;
  piso: number;
  estado: Estado;
  mantenimiento_planificado: boolean;
  reservaHoy: {
    reservaId: string;
    lineaId: string;
    huesped: string | null;
    origen: string | null;
    creadoPorAgente: boolean;
  } | null;
  // Solo viene con valor si la habitación está realmente disponible (sin
  // reservaHoy): días de margen antes de topar con la próxima reserva
  // futura, dentro de una ventana de 30 días. null = ninguna reserva
  // encontrada en esos 30 días (se muestra "Más de 30 días").
  diasHastaProximaReserva: number | null;
  tareaHkEnProceso: {
    tipo: 'limpieza' | 'mantenimiento';
    estado: 'planificado' | 'en_proceso';
    notas: string | null;
  } | null;
  tipos_habitacion: { id: string; nombre: string; aforo_max: number } | null;
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
  notas_operativas: string | null;
  visible_whatsapp: boolean;
  cocheraNumero: string | null;
  vehiculoTipo: string | null;
  origen: string | null;
  creadoPorAgente: boolean;
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

// Colores más intensos/saturados que los tokens globales (var(--estado-bg)),
// pensados solo para esta pantalla (tarjetas grandes y celdas donde el
// color es la señal principal). Mantenimiento se separa deliberadamente de
// Ocupada hacia un naranja puro para que no se confundan a simple vista.
const ESTADO_COLOR_INTENSO: Record<string, { bg: string; border: string; text: string }> = {
  disponible: { bg: '#8fca55', border: '#4c7a19', text: '#173404' },
  ocupada: { bg: '#ef7371', border: '#c8302f', text: '#501313' },
  limpieza: { bg: '#f7c94a', border: '#c97e0a', text: '#412402' },
  mantenimiento: { bg: '#f2954a', border: '#cc5f00', text: '#4a2000' },
  bloqueada: { bg: '#a89ae8', border: '#5347d1', text: '#26215c' },
  reservada: { bg: '#5cbde0', border: '#0f7fa8', text: '#0b3a4a' },
};

const ESTADO_COCHERA_LABEL: Record<Cochera['estado'], string> = {
  disponible: 'Disponible',
  ocupada: 'Ocupada',
};

interface ProximaLlegada {
  checkinPrevisto: string;
  habNumero: number;
  tipoHabitacion: string | null;
  huesped: string;
  origen: string;
}

// Fila cruda que devuelve GET /tareas-hk (ver TareasHkService.listar()).
interface TareaHkFila {
  id: string;
  habitacion_id: string;
  tipo: 'limpieza' | 'mantenimiento';
  estado: 'planificado' | 'en_proceso' | 'terminado';
  con_huesped_dentro: boolean;
  habitaciones: { hab_numero: number; piso: number; tipos_habitacion: { nombre: string } | null } | null;
}

// 'sin_necesidad': marcador de TareasHkService.marcarSinMantenimiento() --
// se identifica por tipo='mantenimiento' + estado='terminado' +
// con_huesped_dentro=false, una combinación que el flujo normal (crear +
// iniciar + terminar) no puede producir mientras la habitación sigue
// 'ocupada' (ver el comentario en ese método del backend).
type CategoriaFilaMantenimiento = 'ocupada_sin_tarea' | 'sin_necesidad' | 'mantenimiento_con_huesped' | 'limpieza_o_mantenimiento';

interface FilaMantenimiento {
  habitacionId: string;
  habNumero: number;
  tipoHabitacion: string | null;
  tarea: TareaHkFila | null;
  categoria: CategoriaFilaMantenimiento;
}

function categoriaDeTarea(tarea: TareaHkFila): CategoriaFilaMantenimiento {
  if (tarea.tipo === 'mantenimiento' && tarea.estado === 'terminado' && !tarea.con_huesped_dentro) {
    return 'sin_necesidad';
  }
  if (tarea.tipo === 'mantenimiento' && tarea.con_huesped_dentro) return 'mantenimiento_con_huesped';
  return 'limpieza_o_mantenimiento';
}

// El mismo color que usa esa habitación en el resto del panel
// (ESTADO_COLOR_INTENSO) -- 'ocupada_sin_tarea', 'mantenimiento_con_huesped'
// y 'sin_necesidad' son todas una habitación que sigue 'ocupada' (rojo,
// CLAUDE.md 3.2); 'limpieza_o_mantenimiento' toma el color según el tipo
// real de la tarea (limpieza = amarillo, mantenimiento sin huésped =
// naranja).
function colorDeFila(fila: FilaMantenimiento): { bg: string; border: string; text: string } {
  if (fila.categoria === 'limpieza_o_mantenimiento') {
    return ESTADO_COLOR_INTENSO[fila.tarea?.tipo === 'limpieza' ? 'limpieza' : 'mantenimiento'];
  }
  return ESTADO_COLOR_INTENSO.ocupada;
}

const ORIGEN_LABEL: Record<string, string> = {
  telefono: 'Teléfono',
  whatsapp: 'WhatsApp',
  booking: 'Booking',
  airbnb: 'Airbnb',
  directo: 'Directo',
  walkin: 'Walk-in',
};

// YYYY-MM-DD en hora Lima -- mismo criterio que el resto del frontend
// (Reservas.tsx) para agrupar por día sin desfasarse con la medianoche UTC.
function fechaLimaYMD(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function hoyLimaYMD(): string {
  return fechaLimaYMD(new Date().toISOString());
}

// HH:MM en hora Lima -- misma conversión que fechaLimaYMD, para mostrar la
// hora de llegada prevista de cada tarjeta.
function horaLima(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function tituloFechaLima(fechaYMD: string): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS_SEMANA[diaSemana]} ${dia} de ${MESES[mes - 1]}`;
}

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
  const [proximasLlegadas, setProximasLlegadas] = useState<ProximaLlegada[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(new Date());
  const [checkinHab, setCheckinHab] = useState<Habitacion | null>(null);
  const [reservaModal, setReservaModal] = useState<Habitacion | null>(null);
  const [precioMascotaDia, setPrecioMascotaDia] = useState(0);
  const [horaCheckoutHotel, setHoraCheckoutHotel] = useState<string | undefined>(undefined);
  const [modo24h, setModo24h] = useState(false);
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem('habitaciones_vista') as Vista | null) ?? 'tabla',
  );
  // Cada check-in/reserva/marcar-disponible recarga toda la tabla por
  // defecto (ver cargarSiAutomatico) -- en jornadas con muchas acciones
  // seguidas eso interrumpe seguido lo que se está haciendo, así que queda
  // configurable y persistido; el botón "Refrescar" siempre está disponible
  // para pedirlo a mano sin importar este valor.
  const [actualizacionAutomatica, setActualizacionAutomatica] = useState<boolean>(
    () => localStorage.getItem('habitaciones_auto_refresh') !== 'false',
  );

  function cambiarVista(v: Vista) {
    setVista(v);
    localStorage.setItem('habitaciones_vista', v);
  }

  function cambiarActualizacionAutomatica(v: boolean) {
    setActualizacionAutomatica(v);
    localStorage.setItem('habitaciones_auto_refresh', String(v));
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
    // se le pide al backend que extienda automáticamente las estadías cuya
    // salida programada ya venció hace más de 1 hora sin checkout ni
    // ampliación. No se espera (antes bloqueaba la carga del panel entero
    // un viaje de red completo) -- el caso que corrige es raro (una salida
    // vencida hace rato sin registrar), y si justo se procesa mientras se
    // pide /habitaciones, el próximo refresh ya lo muestra al día.
    api.post(`/hoteles/${hotelActual.hotelId}/estadias/procesar-salidas-vencidas`).catch(() => {});

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
    api
      .get<ProximaLlegada[]>(`/hoteles/${hotelActual.hotelId}/reservas/proximas-llegadas`)
      .then(setProximasLlegadas)
      .catch(() => {});
    api
      .get<{ precio_mascota: number; hora_checkout: string; modo_24h: boolean }>(`/hoteles/${hotelActual.hotelId}`)
      .then((h) => {
        setPrecioMascotaDia(Number(h.precio_mascota ?? 0));
        setHoraCheckoutHotel(h.hora_checkout?.slice(0, 5));
        setModo24h(!!h.modo_24h);
      })
      .catch(() => {});
  }

  useEffect(() => {
    cargar();
  }, [hotelActual]);

  function cargarSiAutomatico() {
    if (actualizacionAutomatica) cargar();
  }

  async function guardarNotas(hab: Habitacion, notas: string) {
    if (!hotelActual || !hab.estadiaId) return;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/estadias/${hab.estadiaId}/notas`, { notas });
      setHabitaciones((prev) => prev.map((h) => (h.id === hab.id ? { ...h, notas } : h)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar las notas');
    }
  }

  // Nota de la habitación en sí (no ligada a la estadía): la única forma de
  // dejar un aviso operativo ("faltan toallas") cuando está disponible, sin
  // huésped ni tarea HK en curso.
  async function guardarNotasHabitacion(hab: Habitacion, notas: string) {
    if (!hotelActual) return;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/habitaciones/${hab.id}/notas`, { notas });
      setHabitaciones((prev) => prev.map((h) => (h.id === hab.id ? { ...h, notas_operativas: notas || null } : h)));
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

  // A voluntad del recepcionista, editable en cualquier momento: si está en
  // false, el agente de WhatsApp nunca ofrece esta habitación aunque esté
  // realmente disponible (política comercial del hotel).
  async function alternarVisibleWhatsapp(hab: Habitacion) {
    if (!hotelActual) return;
    const nuevo = !hab.visible_whatsapp;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/habitaciones/${hab.id}/visible-whatsapp`, {
        visible: nuevo,
      });
      setHabitaciones((prev) => prev.map((h) => (h.id === hab.id ? { ...h, visible_whatsapp: nuevo } : h)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  async function marcarDisponible(hab: Habitacion) {
    if (!hotelActual) return;
    try {
      await api.patch(`/hoteles/${hotelActual.hotelId}/habitaciones/${hab.id}/marcar-disponible`);
      cargarSiAutomatico();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar disponible');
    }
  }

  function preciosDe(tipoId: string | undefined): TipoHabitacionPrecios | null {
    if (!tipoId) return null;
    return tiposHabitacion.find((t) => t.id === tipoId) ?? null;
  }

  function etiquetaEstado(h: Habitacion): string {
    if (h.reservaHoy) return 'Reservada';
    // tareaHkEnProceso también puede traer una tarea apenas 'planificado'
    // (para mostrar su nota antes de que HK le dé Iniciar, ver
    // HabitacionesService) -- el texto "En proceso de X" solo debe salir
    // cuando de verdad está en_proceso, si no un checkout recién hecho
    // (habitación en 'limpieza' con su tarea todavía sin iniciar) diría
    // "en proceso" sin que nadie haya empezado nada.
    if (
      h.tareaHkEnProceso?.tipo === 'limpieza' &&
      h.tareaHkEnProceso?.estado === 'en_proceso' &&
      h.estado === 'limpieza'
    )
      return 'En proceso de limpieza';
    if (
      h.tareaHkEnProceso?.tipo === 'mantenimiento' &&
      h.tareaHkEnProceso?.estado === 'en_proceso' &&
      h.estado === 'ocupada'
    )
      return 'En proceso de mantenimiento';
    return ESTADO_LABEL[h.estado];
  }

  // Color a usar para pintar la fila/tarjeta: si hay una reserva para hoy
  // sin check-in todavía, el celeste "reservada" manda sobre el estado
  // real (que en ese caso siempre es 'disponible').
  function colorEstado(h: Habitacion): string {
    return h.reservaHoy ? 'reservada' : h.estado;
  }

  if (!hotelActual) return <p style={{ color: 'var(--text-muted)' }}>Cargando hotel...</p>;
  // Solo la carga inicial reemplaza toda la pantalla; las recargas
  // posteriores (acciones, botón Refrescar) mantienen la tabla visible y
  // solo muestran el aviso "Actualizando..." de abajo -- antes cualquier
  // recarga la blanqueaba entera, cortando lo que se estaba haciendo.
  if (loading && habitaciones.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>Cargando habitaciones...</p>;
  }
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
                  background: ESTADO_COLOR_INTENSO[estado].border,
                  display: 'inline-block',
                }}
              />
              {ESTADO_LABEL[estado]}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ESTADO_COLOR_INTENSO.reservada.border,
                display: 'inline-block',
              }}
            />
            Reservada (hay que pasar a estadía)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={actualizacionAutomatica}
              onChange={(e) => cambiarActualizacionAutomatica(e.target.checked)}
            />
            Actualizar automáticamente
          </label>
          <button
            type="button"
            onClick={cargar}
            disabled={loading}
            title="Volver a cargar la lista de habitaciones"
            style={{
              padding: '6px 10px',
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-1)',
              color: 'var(--text-secondary)',
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Actualizando...' : '🔄 Refrescar'}
          </button>
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
              <th style={thStyle}>¿Mantenim.?</th>
              <th style={{ ...thStyle, borderRight: 'none' }} title="Si está apagado, el agente de WhatsApp no ofrece esta habitación">
                WhatsApp
              </th>
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
                  {h.reservaHoy ? (
                    <button onClick={() => setReservaModal(h)} style={linkBtnStyle}>
                      Ver reserva
                    </button>
                  ) : (
                    h.estado === 'disponible' && (
                      <button onClick={() => setCheckinHab(h)} style={linkBtnStyle}>
                        Check-in
                      </button>
                    )
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
                      background: ESTADO_COLOR_INTENSO[colorEstado(h)].bg,
                      color: ESTADO_COLOR_INTENSO[colorEstado(h)].text,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 11,
                    }}
                  >
                    {etiquetaEstado(h)}
                  </span>
                </td>
                <td style={tdStyle}>{h.huesped ?? h.reservaHoy?.huesped ?? ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoFechaHora(h.checkinReal) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoFechaHora(h.checkoutPrevisto) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalAlquiler) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalOtrosServicios) : ''}</td>
                <td style={tdStyle}>{h.huesped ? formatoMonto(h.totalPagado) : ''}</td>
                <td
                  style={{
                    ...tdStyle,
                    ...(h.huesped && h.saldo != null && h.saldo > 0
                      ? { background: ESTADO_COLOR_INTENSO.ocupada.bg, color: ESTADO_COLOR_INTENSO.ocupada.text, fontWeight: 700 }
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
                    <span style={{ color: 'var(--nota-texto)', fontWeight: 700, fontStyle: 'italic' }}>
                      {h.tareaHkEnProceso.notas}
                    </span>
                  ) : (
                    <NotasCelda notas={h.notas_operativas ?? ''} onGuardar={(n) => guardarNotasHabitacion(h, n)} />
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={h.mantenimiento_planificado}
                    disabled={h.estado !== 'ocupada'}
                    title={h.estado !== 'ocupada' ? 'Solo se puede marcar mientras la habitación está ocupada' : ''}
                    onChange={() => alternarMantenimientoPlanificado(h)}
                  />
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', borderRight: 'none' }}>
                  <input
                    type="checkbox"
                    checked={h.visible_whatsapp}
                    title="El agente de WhatsApp la ofrece cuando está marcado"
                    onChange={() => alternarVisibleWhatsapp(h)}
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
                          background: ESTADO_COLOR_INTENSO[c.estado].bg,
                          color: ESTADO_COLOR_INTENSO[c.estado].text,
                          fontWeight: 700,
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
            if (h.reservaHoy) setReservaModal(h);
            else if (h.estado === 'disponible') setCheckinHab(h);
            else if (h.estado === 'ocupada' && h.estadiaId) navigate(`/estadias/${h.estadiaId}`);
          }}
          onClickCochera={(c) => {
            if (c.estado !== 'ocupada' || !c.ocupante?.habNumero) return;
            const hab = habitaciones.find((h) => h.hab_numero === c.ocupante!.habNumero);
            if (hab?.estadiaId) navigate(`/estadias/${hab.estadiaId}`);
          }}
          onGuardarNotas={guardarNotas}
          onGuardarNotasHabitacion={guardarNotasHabitacion}
        />
      )}

      <ProximasLlegadas llegadas={proximasLlegadas} />

      <SeccionMantenimientoLimpieza
        hotelId={hotelActual.hotelId}
        habitaciones={habitaciones}
        onCambio={cargarSiAutomatico}
      />

      {checkinHab && (
        <CheckinRapidoModal
          hotelId={hotelActual.hotelId}
          habitacionId={checkinHab.id}
          habNumero={checkinHab.hab_numero}
          habTipo={checkinHab.tipos_habitacion?.nombre}
          precios={preciosDe(checkinHab.tipos_habitacion?.id)}
          onClose={() => setCheckinHab(null)}
          onCreado={cargarSiAutomatico}
        />
      )}

      {reservaModal && reservaModal.reservaHoy && (
        <ReservaFormModal
          hotelId={hotelActual.hotelId}
          habitacionId={reservaModal.id}
          habNumero={reservaModal.hab_numero}
          aforoMax={reservaModal.tipos_habitacion?.aforo_max ?? 0}
          tarifaSugerida={preciosDe(reservaModal.tipos_habitacion?.id)?.precio_normal ?? 0}
          precioMascotaDia={precioMascotaDia}
          horaCheckoutHotel={horaCheckoutHotel}
          modo24h={modo24h}
          modo="editar"
          reservaId={reservaModal.reservaHoy.reservaId}
          lineaId={reservaModal.reservaHoy.lineaId}
          onClose={() => setReservaModal(null)}
          onGuardado={cargarSiAutomatico}
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
  onGuardarNotasHabitacion,
}: {
  habitaciones: Habitacion[];
  cocheras: Cochera[];
  onClickHabitacion: (h: Habitacion) => void;
  onClickCochera: (c: Cochera) => void;
  onGuardarNotas: (h: Habitacion, notas: string) => void;
  onGuardarNotasHabitacion: (h: Habitacion, notas: string) => void;
}) {
  return (
    <div>
      <div style={tarjetasGridStyle}>
        {habitaciones.map((h) => {
          const clickable = !!h.reservaHoy || h.estado === 'disponible' || (h.estado === 'ocupada' && !!h.estadiaId);
          const color = h.reservaHoy ? 'reservada' : h.estado;
          const etiqueta = h.reservaHoy ? 'Reservada' : ESTADO_LABEL[h.estado];
          const notasHk = h.huesped ? null : h.tareaHkEnProceso?.notas ?? null;
          const tituloClick = h.reservaHoy ? 'Ver la reserva y pasarla a estadía' : h.estado === 'disponible' ? 'Hacer check-in' : 'Ver detalle';
          // Canal de la reserva que ocupa (o va a ocupar hoy) la habitación
          // -- ver colorOrigen.ts, mismo criterio que la leyenda del
          // calendario de Reservas. Sin huésped ni reserva de hoy no hay
          // ningún origen que mostrar.
          const origenInfo = h.huesped
            ? { origen: h.origen, creadoPorAgente: h.creadoPorAgente }
            : h.reservaHoy
              ? { origen: h.reservaHoy.origen, creadoPorAgente: h.reservaHoy.creadoPorAgente }
              : null;
          return (
            <div
              key={h.id}
              onClick={() => clickable && onClickHabitacion(h)}
              style={{
                ...tarjetaStyle,
                background: ESTADO_COLOR_INTENSO[color].bg,
                border: `2px solid ${ESTADO_COLOR_INTENSO[color].border}`,
                cursor: clickable ? 'pointer' : 'default',
              }}
              title={clickable ? tituloClick : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {h.vehiculoTipo && (
                    <span
                      title={`Vehículo: ${h.vehiculoTipo}`}
                      style={{ fontSize: 16, lineHeight: 1 }}
                    >
                      {h.vehiculoTipo === 'moto' ? '🏍️' : '🚗'}
                    </span>
                  )}
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{h.hab_numero}</span>
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_COLOR_INTENSO[color].text }}>{etiqueta}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{h.tipos_habitacion?.nombre ?? '—'}</span>
              {(h.huesped || h.reservaHoy?.huesped) && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={h.huesped ?? h.reservaHoy?.huesped ?? undefined}
                >
                  {h.huesped ?? h.reservaHoy?.huesped}
                </span>
              )}
              {h.huesped && h.checkinReal && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fde047' }}>
                  Chk in: {formatoFechaHora(h.checkinReal)}
                </span>
              )}
              {h.huesped && h.checkoutPrevisto && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fde047' }}>
                  Chk out: {formatoFechaHora(h.checkoutPrevisto)}
                </span>
              )}
              {h.huesped && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: h.saldo != null && h.saldo > 0 ? 700 : 600,
                    color: h.saldo != null && h.saldo > 0 ? '#ffffff' : 'var(--text-primary)',
                  }}
                >
                  Saldo: {h.saldo != null ? `S/. ${h.saldo.toFixed(2)}` : '—'}
                </span>
              )}
              {h.cocheraNumero && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--nota-texto)' }}>
                  {h.vehiculoTipo === 'moto' ? '🏍️' : '🚗'} Cochera {h.cocheraNumero}
                </span>
              )}
              {h.huesped && (
                <div onClick={(e) => e.stopPropagation()}>
                  <NotasCelda notas={h.notas ?? ''} onGuardar={(n) => onGuardarNotas(h, n)} tarjeta />
                </div>
              )}
              {!h.huesped && notasHk && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--nota-texto)',
                    fontWeight: 700,
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
              {!h.huesped && !notasHk && (
                <div onClick={(e) => e.stopPropagation()}>
                  <NotasCelda
                    notas={h.notas_operativas ?? ''}
                    onGuardar={(n) => onGuardarNotasHabitacion(h, n)}
                    tarjeta
                  />
                </div>
              )}
              {origenInfo && (
                <span
                  style={{
                    alignSelf: 'flex-start',
                    background: colorPorOrigen(origenInfo),
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                  }}
                >
                  {labelPorOrigen(origenInfo)}
                </span>
              )}
              {!h.huesped && !h.reservaHoy && h.estado === 'disponible' && (
                <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLOR_INTENSO.disponible.text }}>
                  📅{' '}
                  {h.diasHastaProximaReserva == null
                    ? 'Disponible más de 30 días'
                    : `Disponible ${h.diasHastaProximaReserva} día${h.diasHastaProximaReserva === 1 ? '' : 's'}`}
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
                    background: ESTADO_COLOR_INTENSO[c.estado].bg,
                    border: `2px solid ${ESTADO_COLOR_INTENSO[c.estado].border}`,
                    cursor: clickable ? 'pointer' : 'default',
                    minHeight: 76,
                  }}
                  title={clickable ? 'Ver detalle' : undefined}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: '#fff',
                        textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                      }}
                    >
                      {c.numero}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: ESTADO_COLOR_INTENSO[c.estado].text }}>
                      {ESTADO_COCHERA_LABEL[c.estado]}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.tamano}
                    {c.tipo_vehiculo_permitido ? ` · ${c.tipo_vehiculo_permitido}` : ''}
                    {c.es_externa ? ' · externa' : ''}
                  </span>
                  {c.ocupante && (
                    <span style={{ fontSize: 11, color: '#fff' }}>
                      Hab. <b style={{ fontSize: 15 }}>{c.ocupante.habNumero}</b> · {c.ocupante.huesped ?? '—'}
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

// Solo lectura -- de un vistazo, quién llega mañana, pasado y el siguiente
// (3 días), para anticipar limpieza/HK y recepción sin tener que ir al
// calendario de Reservas. Mismo color "reservada" (celeste) que ya se usa
// en el resto de esta pantalla para una habitación con reserva pendiente.
function ProximasLlegadas({ llegadas }: { llegadas: ProximaLlegada[] }) {
  const dias = [1, 2, 3].map((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Próximas llegadas</h2>
      {dias.map((fechaYMD) => {
        const delDia = llegadas.filter((l) => fechaLimaYMD(l.checkinPrevisto) === fechaYMD);
        return (
          <div key={fechaYMD} style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {tituloFechaLima(fechaYMD)}
            </p>
            {delDia.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Sin llegadas.</p>
            ) : (
              <div style={tarjetasGridStyle}>
                {delDia.map((l, i) => (
                  <div
                    key={i}
                    style={{
                      ...tarjetaStyle,
                      background: ESTADO_COLOR_INTENSO.reservada.bg,
                      border: `2px solid ${ESTADO_COLOR_INTENSO.reservada.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{l.habNumero}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: ESTADO_COLOR_INTENSO.reservada.text }}>
                        {horaLima(l.checkinPrevisto)}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.tipoHabitacion ?? '—'}</span>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={l.huesped}
                    >
                      {l.huesped}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ESTADO_COLOR_INTENSO.reservada.text }}>
                      {ORIGEN_LABEL[l.origen] ?? l.origen}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Habitaciones ocupadas (tengan tarea o no, para que recepción revise una
// por una) + limpieza/mantenimiento -- toda la cola de HK en un solo lugar,
// con checks manuales que hacen exactamente lo mismo que haría HK desde su
// propio módulo (mismos endpoints de tareas-hk). El filtro de fecha usa el
// mismo 'fecha' de TareasHkService.listar(), que ya arrastra al día actual
// las tareas 'planificado' que quedaron pendientes de días anteriores (ver
// rolloverPlanificadasVencidas() en el backend) -- así nunca se pierde una
// pendiente aunque no se haya cerrado el día que se creó.
function SeccionMantenimientoLimpieza({
  hotelId,
  habitaciones,
  onCambio,
}: {
  hotelId: string;
  habitaciones: Habitacion[];
  onCambio: () => void;
}) {
  const [tareas, setTareas] = useState<TareaHkFila[]>([]);
  const [fechaFiltro, setFechaFiltro] = useState(hoyLimaYMD());
  // Por defecto no se ven las ya terminadas (la habitación quedó limpia y
  // disponible, o se resolvió el mantenimiento -- ya no hay nada por
  // hacer). Este filtro las vuelve a mostrar, para revisar cuál fue el
  // plan completo del día.
  const [mostrarTerminadas, setMostrarTerminadas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

  function cargarTareas() {
    setLoading(true);
    return api
      .get<TareaHkFila[]>(`/hoteles/${hotelId}/tareas-hk?fecha=${fechaFiltro}`)
      .then(setTareas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las tareas'))
      .finally(() => setLoading(false));
  }

  // También se vuelve a cargar cuando cambia `habitaciones` (nueva
  // referencia en cada `cargar()` del padre): así "Refrescar" y el
  // auto-refresh después de una acción (check-in, marcar disponible, etc.)
  // también actualizan esta sección -- si no, quedaba mostrando datos
  // viejos (ej. una habitación ya limpia seguía apareciendo como
  // pendiente) hasta que algo dentro de la sección misma la recargara.
  useEffect(() => {
    cargarTareas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId, fechaFiltro, habitaciones]);

  // Planifica un mantenimiento con huésped dentro (CLAUDE.md 3.2: se le
  // pregunta al huésped si autoriza el ingreso) -- la única forma de
  // "planificar" desde una fila 'ocupada_sin_tarea', ya que limpieza y
  // mantenimiento sin huésped siempre nacen con su propia tarea (al
  // checkout o cuando HK la crea).
  async function crearTareaConHuesped(habitacionId: string) {
    setAccionando(habitacionId);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tareas-hk`, {
        habitacionId,
        tipo: 'mantenimiento',
        conHuespedDentro: true,
      });
      await cargarTareas();
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo planificar el mantenimiento');
    } finally {
      setAccionando(null);
    }
  }

  async function iniciarTarea(habitacionId: string, tareaId: string) {
    setAccionando(habitacionId);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tareas-hk/${tareaId}/iniciar`);
      await cargarTareas();
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar la tarea');
    } finally {
      setAccionando(null);
    }
  }

  async function terminarTarea(habitacionId: string, tareaId: string) {
    setAccionando(habitacionId);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tareas-hk/${tareaId}/terminar`);
      await cargarTareas();
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo terminar la tarea');
    } finally {
      setAccionando(null);
    }
  }

  async function marcarSinNecesidad(habitacionId: string) {
    setAccionando(habitacionId);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/tareas-hk/sin-mantenimiento`, { habitacionId });
      await cargarTareas();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setAccionando(null);
    }
  }

  async function marcarDisponible(habitacionId: string) {
    setAccionando(habitacionId);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/habitaciones/${habitacionId}/marcar-disponible`);
      await cargarTareas();
      onCambio();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo marcar disponible');
    } finally {
      setAccionando(null);
    }
  }

  const esHoy = fechaFiltro === hoyLimaYMD();
  const filasBrutas: FilaMantenimiento[] = [];
  const idsConTarea = new Set<string>();
  for (const t of tareas) {
    idsConTarea.add(t.habitacion_id);
    filasBrutas.push({
      habitacionId: t.habitacion_id,
      habNumero: t.habitaciones?.hab_numero ?? 0,
      tipoHabitacion: t.habitaciones?.tipos_habitacion?.nombre ?? null,
      tarea: t,
      categoria: categoriaDeTarea(t),
    });
  }
  // Solo se proyectan habitaciones ocupadas sin tarea para HOY -- para una
  // fecha pasada esto sería el estado ACTUAL de la habitación, no el que
  // tenía ese día, así que no tendría sentido. idsConTarea se arma ANTES
  // de filtrar las terminadas de más abajo, para que una habitación recién
  // resuelta hoy no reaparezca como "ocupada sin tarea".
  if (esHoy) {
    for (const h of habitaciones) {
      if (h.estado === 'ocupada' && !idsConTarea.has(h.id)) {
        filasBrutas.push({
          habitacionId: h.id,
          habNumero: h.hab_numero,
          tipoHabitacion: h.tipos_habitacion?.nombre ?? null,
          tarea: null,
          categoria: 'ocupada_sin_tarea',
        });
      }
    }
  }
  // Para HOY, una tarea ya terminada no tiene nada más por hacer -- por
  // defecto se saca de la vista apenas se completa (ej. hab. 403: limpieza
  // terminada, ya está disponible, no debe seguir apareciendo acá) salvo
  // que se active "Ver plan del día", para revisar todo lo que se hizo.
  // Para una fecha pasada siempre se ve todo: es un filtro histórico.
  const filas =
    esHoy && !mostrarTerminadas ? filasBrutas.filter((f) => f.tarea?.estado !== 'terminado') : filasBrutas;
  filas.sort((a, b) => a.habNumero - b.habNumero);

  function estadoActualDe(habitacionId: string): Estado | undefined {
    return habitaciones.find((h) => h.id === habitacionId)?.estado;
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Mantenimientos y Limpiezas</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>
            Fecha
          </label>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}
          />
        </div>
        {!esHoy && (
          <button
            type="button"
            onClick={() => setFechaFiltro(hoyLimaYMD())}
            style={{
              padding: '8px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Hoy
          </button>
        )}
        {esHoy && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={mostrarTerminadas}
              onChange={(e) => setMostrarTerminadas(e.target.checked)}
            />
            Ver plan del día (incluye las ya limpias/resueltas)
          </label>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{error}</p>}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      ) : filas.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No hay nada que mostrar para esta fecha.</p>
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: 11 }}>
                <th style={thStyle}>Habitación</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Planificada</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>En proceso</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Terminada</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>No necesita mantenimiento</th>
                <th style={{ ...thStyle, textAlign: 'center', borderRight: 'none' }}>Marcar disponible</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const estadoActual = estadoActualDe(fila.habitacionId);
                const puedeMarcarDisponible = esHoy && (estadoActual === 'limpieza' || estadoActual === 'mantenimiento');
                const bloqueada = accionando === fila.habitacionId;
                const color = colorDeFila(fila);
                return (
                  <tr
                    key={`${fila.habitacionId}-${fila.tarea?.id ?? 'sin-tarea'}`}
                    style={{
                      borderTop: '1px solid var(--border-strong)',
                      background: color.bg,
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 700, color: color.text, borderRight: `1px solid ${color.border}` }}>
                      {fila.habNumero}
                      {fila.tipoHabitacion ? ` · ${fila.tipoHabitacion}` : ''}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fila.categoria === 'sin_necesidad' ? (
                        '—'
                      ) : (
                        <input
                          type="checkbox"
                          checked={!!fila.tarea}
                          disabled={!!fila.tarea || bloqueada}
                          onChange={() => crearTareaConHuesped(fila.habitacionId)}
                          title={fila.tarea ? 'Ya planificada' : 'Planificar mantenimiento (con huésped dentro)'}
                        />
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fila.categoria === 'sin_necesidad' ? (
                        '—'
                      ) : (
                        <input
                          type="checkbox"
                          checked={fila.tarea?.estado === 'en_proceso' || fila.tarea?.estado === 'terminado'}
                          disabled={fila.tarea?.estado !== 'planificado' || bloqueada}
                          onChange={() => fila.tarea && iniciarTarea(fila.habitacionId, fila.tarea.id)}
                        />
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fila.categoria === 'sin_necesidad' ? (
                        '—'
                      ) : (
                        <input
                          type="checkbox"
                          checked={fila.tarea?.estado === 'terminado'}
                          disabled={fila.tarea?.estado !== 'en_proceso' || bloqueada}
                          onChange={() => fila.tarea && terminarTarea(fila.habitacionId, fila.tarea.id)}
                        />
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {fila.categoria === 'sin_necesidad' ? (
                        <input type="checkbox" checked disabled title="Marcado por recepción" />
                      ) : fila.categoria === 'ocupada_sin_tarea' ? (
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={bloqueada}
                          onChange={() => marcarSinNecesidad(fila.habitacionId)}
                          title="Confirmar que hoy no necesita mantenimiento"
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', borderRight: 'none' }}>
                      {puedeMarcarDisponible ? (
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={bloqueada}
                          onChange={() => marcarDisponible(fila.habitacionId)}
                          title="Usar solo si HK ya terminó pero se le olvidó cerrar la tarea"
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          fontWeight: notas ? 700 : undefined,
          color: notas ? 'var(--nota-texto)' : 'var(--text-muted)',
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
