import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHotel } from '../contexts/HotelContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { api, ApiError } from '../lib/api';

interface TipoCambioVigente {
  fecha: string;
  valor_compra: number;
  valor_venta: number;
}

interface TurnoDisponible {
  id: string;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
}

interface EstadoTurno {
  sesionAbierta: boolean;
  avisoCierre: boolean;
  minutosParaFin?: number;
}

// Cada cuánto se consulta el estado del turno (ver caja/estado-turno en el
// backend): no hay cron real posible en Render free tier, así que el aviso
// de "tu turno está por terminar" se dispara aquí, con la app abierta,
// igual que la sincronización del tipo de cambio más abajo. Es solo un
// recordatorio -- cada recepcionista decide cuándo cerrar su turno; el
// sistema ya no la cierra sola por vencimiento (si acaso, se cierra sola
// al hacer logout sin haberla cerrado a mano, ver cerrarSesion() más
// abajo).
const POLL_ESTADO_TURNO_MS = 60_000;

// Única fuente de verdad de qué rol ve qué: de acá salen tanto el menú
// lateral como qué rutas puede visitar cada rol (rutaPermitida más abajo)
// -- así nunca quedan desincronizados un ítem de menú oculto con una ruta
// que igual se puede visitar tipeando la URL a mano.
type Rol = 'admin' | 'recepcion' | 'hk';

const NAV_ITEMS: { to: string; label: string; icon: string; roles: Rol[] }[] = [
  { to: '/habitaciones', label: 'Habitaciones', icon: '⊞', roles: ['admin', 'recepcion'] },
  { to: '/huespedes', label: 'Huéspedes', icon: '🧑', roles: ['admin', 'recepcion'] },
  { to: '/reservas', label: 'Reservas', icon: '📅', roles: ['admin', 'recepcion'] },
  { to: '/estadias', label: 'Estadías', icon: '🚪', roles: ['admin', 'recepcion'] },
  { to: '/caja', label: 'Caja', icon: '💵', roles: ['admin', 'recepcion'] },
  { to: '/tareas-hk', label: 'Tareas HK', icon: '🧹', roles: ['admin', 'hk'] },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: '📄', roles: ['admin', 'recepcion'] },
  { to: '/configuracion', label: 'Configuración', icon: '⚙', roles: ['admin'] },
];

function rutaPermitida(rol: Rol, pathname: string): boolean {
  if (rol === 'admin') return true;
  return NAV_ITEMS.some(
    (item) => item.roles.includes(rol) && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
  );
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  recepcion: 'Recepcionista',
  hk: 'Housekeeping',
};

export function Layout() {
  const { signOut } = useAuth();
  const { asignaciones, hotelActual, cambiarHotel, personalNombre } = useHotel();
  const isMobile = useIsMobile();
  const [navAbierto, setNavAbierto] = useState(false);
  const [tipoCambio, setTipoCambio] = useState<TipoCambioVigente | null>(null);

  useEffect(() => {
    if (!hotelActual) return;
    const hoy = new Date().toISOString().slice(0, 10);
    api
      .get<TipoCambioVigente | null>(`/hoteles/${hotelActual.hotelId}/tipo-cambio/vigente`)
      .then((tc) => {
        setTipoCambio(tc);
        // Sin cron real posible (Render free tier duerme): si lo que hay
        // guardado no es el de hoy, se intenta traer de SUNAT en cuanto
        // alguien abre la app -- mismo patrón ya usado para las salidas
        // vencidas de Habitaciones.tsx. Silencioso si SUNAT no responde:
        // el header simplemente sigue mostrando el último conocido.
        if (!tc || tc.fecha !== hoy) {
          api
            .post<TipoCambioVigente>(`/hoteles/${hotelActual.hotelId}/tipo-cambio/sincronizar`)
            .then(setTipoCambio)
            .catch((err) => console.error('No se pudo sincronizar el tipo de cambio con SUNAT:', err));
        }
      })
      .catch(() => {});
  }, [hotelActual]);

  const location = useLocation();
  const [estadoTurno, setEstadoTurno] = useState<EstadoTurno | null>(null);
  const avisoMostradoRef = useRef(false);

  // Gate obligatorio: un recepcionista es responsable de su caja desde que
  // entra, así que no puede usar el sistema sin haber elegido turno y
  // abierto sesión de caja. null = todavía verificando (no se sabe si
  // mostrar el gate o el sistema normal); admin/HK nunca lo ven.
  const [sesionCajaAbierta, setSesionCajaAbierta] = useState<boolean | null>(null);

  useEffect(() => {
    if (!hotelActual) {
      setSesionCajaAbierta(null);
      return;
    }
    if (hotelActual.rol !== 'recepcion') {
      setSesionCajaAbierta(true);
      return;
    }
    setSesionCajaAbierta(null);
    api
      .get(`/hoteles/${hotelActual.hotelId}/caja/actual`)
      .then(() => setSesionCajaAbierta(true))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setSesionCajaAbierta(false);
        else setSesionCajaAbierta(true); // ante un error inesperado, no se bloquea el acceso
      });
  }, [hotelActual]);

  useEffect(() => {
    // Solo admin/recepción pueden tener caja abierta (mismos roles que
    // habilitan el módulo Caja); HK no necesita este poll.
    if (!hotelActual || (hotelActual.rol !== 'admin' && hotelActual.rol !== 'recepcion')) {
      setEstadoTurno(null);
      avisoMostradoRef.current = false;
      return;
    }

    let cancelado = false;

    async function consultarEstadoTurno() {
      try {
        const estado = await api.get<EstadoTurno>(`/hoteles/${hotelActual!.hotelId}/caja/estado-turno`);
        if (cancelado) return;
        setEstadoTurno(estado);

        if (estado.avisoCierre && !avisoMostradoRef.current) {
          avisoMostradoRef.current = true;
          alert(
            `Tu turno termina en ${Math.max(estado.minutosParaFin ?? 0, 0)} minuto(s). ` +
              'Saca tu liquidación de caja y ciérrala antes de irte.',
          );
        } else if (!estado.avisoCierre) {
          avisoMostradoRef.current = false;
        }
      } catch {
        // Silencioso: si la consulta falla (red, servidor dormido, etc.) el
        // header simplemente no muestra el aviso hasta el próximo poll.
      }
    }

    consultarEstadoTurno();
    const intervalo = setInterval(consultarEstadoTurno, POLL_ESTADO_TURNO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [hotelActual]);

  const navItems = hotelActual ? NAV_ITEMS.filter((item) => item.roles.includes(hotelActual.rol)) : [];

  const sidebarVisible = !isMobile || navAbierto;

  // Cada quien decide cuándo cerrar su turno mientras trabaja, pero no
  // puede quedarse abierto "colgado" si se va del sistema: al cerrar
  // sesión, si tiene una caja abierta se cierra sola antes (mismo criterio
  // que un cierre manual desde Caja.tsx -- calcula el saldo final de
  // verdad, no es un abandono silencioso).
  async function cerrarSesion() {
    if (hotelActual) {
      try {
        const sesion = await api.get<{ id: string }>(`/hoteles/${hotelActual.hotelId}/caja/actual`);
        await api.post(`/hoteles/${hotelActual.hotelId}/caja/sesiones/${sesion.id}/cerrar`);
      } catch {
        // Sin sesión abierta (404) o error de red: no bloquea el cierre de sesión.
      }
    }
    await signOut();
  }

  if (hotelActual?.rol === 'recepcion' && sesionCajaAbierta === null) {
    // Evita el parpadeo de mostrar el menú normal un instante antes de
    // saber si hace falta el gate de turno.
    return <p style={{ padding: 20, color: 'var(--text-muted)' }}>Cargando...</p>;
  }

  if (hotelActual?.rol === 'recepcion' && sesionCajaAbierta === false) {
    return <AbrirTurnoGate hotelId={hotelActual.hotelId} hotelNombre={hotelActual.nombre} onAbierto={() => setSesionCajaAbierta(true)} />;
  }

  // Que un rol no vea un módulo en el menú no alcanza: si alguien tipea la
  // URL a mano igual queda bloqueado -- se manda al primer módulo que sí
  // le corresponde (para admin/recepción es Habitaciones, para HK es
  // Tareas HK, por el orden de NAV_ITEMS).
  if (hotelActual && location.pathname !== '/' && !rutaPermitida(hotelActual.rol, location.pathname)) {
    const home = navItems[0]?.to ?? '/habitaciones';
    return <Navigate to={home} replace />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {isMobile && navAbierto && (
        <div
          onClick={() => setNavAbierto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 40,
          }}
        />
      )}

      {sidebarVisible && (
        <aside
          style={{
            width: 190,
            borderRight: '1px solid var(--chrome-border)',
            background: 'var(--chrome-bg)',
            padding: '16px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            ...(isMobile
              ? {
                  position: 'fixed',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  zIndex: 50,
                  boxShadow: '2px 0 12px rgba(0,0,0,0.15)',
                  overflowY: 'auto',
                }
              : {}),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 20px' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--chrome-bg)',
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              H
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--chrome-text)' }}>Hotel Suite</span>
          </div>

          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setNavAbierto(false)}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 8px',
                borderRadius: 'var(--radius)',
                fontSize: 13,
                textDecoration: 'none',
                color: isActive ? 'var(--chrome-text)' : 'var(--chrome-text-muted)',
                background: isActive ? 'var(--chrome-active-bg)' : 'transparent',
                fontWeight: isActive ? 500 : 400,
              })}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </aside>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: isMobile ? '10px 12px' : '10px 20px',
            borderBottom: '1px solid var(--chrome-border)',
            background: 'var(--chrome-bg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setNavAbierto((v) => !v)}
                aria-label="Abrir menú"
                style={{
                  border: '1px solid var(--chrome-border)',
                  borderRadius: 'var(--radius)',
                  background: 'transparent',
                  padding: '6px 10px',
                  fontSize: 16,
                  lineHeight: 1,
                  flexShrink: 0,
                  color: 'var(--chrome-text)',
                }}
              >
                ☰
              </button>
            )}
            <select
              value={hotelActual?.hotelId ?? ''}
              onChange={(e) => cambiarHotel(e.target.value)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '6px 10px',
                fontSize: 13,
                background: 'var(--surface-1)',
                color: 'var(--text-primary)',
                minWidth: 0,
                maxWidth: isMobile ? 150 : undefined,
              }}
            >
              {asignaciones.map((a) => (
                <option key={a.hotelId} value={a.hotelId}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {personalNombre && (
              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--chrome-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: isMobile ? 110 : 220,
                  }}
                >
                  {personalNombre}
                </div>
                {hotelActual && (
                  <div style={{ fontSize: 11, color: 'var(--chrome-text-muted)' }}>
                    {ROL_LABEL[hotelActual.rol] ?? hotelActual.rol}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => cerrarSesion()}
              style={{
                border: '1px solid var(--chrome-border)',
                borderRadius: 'var(--radius)',
                background: 'transparent',
                padding: '6px 12px',
                fontSize: 13,
                color: 'var(--chrome-text)',
                flexShrink: 0,
              }}
            >
              {isMobile ? 'Salir' : 'Cerrar sesión'}
            </button>
          </div>
        </header>

        <div
          style={{
            padding: isMobile ? '4px 12px' : '4px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-1)',
            fontSize: 11,
            color: 'var(--text-secondary)',
          }}
        >
          {tipoCambio ? (
            <>
              T.C. SUNAT · Compra: {Number(tipoCambio.valor_compra).toFixed(3)} · Venta:{' '}
              {Number(tipoCambio.valor_venta).toFixed(3)} · {new Date(`${tipoCambio.fecha}T00:00:00`).toLocaleDateString('es-PE')}
            </>
          ) : (
            'Sin tipo de cambio configurado (Configuración → Tipo de cambio)'
          )}
        </div>

        {estadoTurno?.avisoCierre && (
          <div
            style={{
              padding: isMobile ? '6px 12px' : '6px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--egreso-bg)',
              color: 'var(--egreso)',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            ⚠ Tu turno termina en {Math.max(estadoTurno.minutosParaFin ?? 0, 0)} minuto(s) — saca tu
            liquidación y cierra tu caja en el módulo Caja.
          </div>
        )}

        <main style={{ flex: 1, padding: isMobile ? 12 : 20, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Pantalla obligatoria justo después de loguearse (solo rol recepción):
// nadie entra al resto del sistema sin elegir turno, que abre la caja de
// una vez (mismo POST /caja/abrir que usa Caja.tsx -- el saldo inicial se
// hereda del cierre del turno anterior, ver CajaService.abrirTurno()).
function AbrirTurnoGate({
  hotelId,
  hotelNombre,
  onAbierto,
}: {
  hotelId: string;
  hotelNombre: string;
  onAbierto: () => void;
}) {
  const { signOut } = useAuth();
  const [turnos, setTurnos] = useState<TurnoDisponible[]>([]);
  const [turnoId, setTurnoId] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<TurnoDisponible[]>(`/hoteles/${hotelId}/caja/turnos`).then(setTurnos).catch(() => {});
  }, [hotelId]);

  async function abrir(e: FormEvent) {
    e.preventDefault();
    if (!turnoId) return;
    setEnviando(true);
    setError(null);
    try {
      await api.post(`/hoteles/${hotelId}/caja/abrir`, { turnoId });
      onAbierto();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo abrir el turno');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
      <form
        onSubmit={abrir}
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 28,
          boxSizing: 'border-box',
        }}
      >
        <p style={{ fontWeight: 600, fontSize: 16, margin: '0 0 4px' }}>Elige tu turno</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
          {hotelNombre} — antes de entrar al sistema, abre tu caja. El saldo inicial se hereda del
          cierre del turno anterior.
        </p>

        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
          Turno
        </label>
        <select
          value={turnoId}
          onChange={(e) => setTurnoId(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '9px 10px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        >
          <option value="">Selecciona...</option>
          {turnos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre} ({t.hora_inicio}–{t.hora_fin})
            </option>
          ))}
        </select>

        {error && <p style={{ color: 'var(--danger)', fontSize: 12, marginTop: 12 }}>{error}</p>}

        <button
          type="submit"
          disabled={enviando || !turnoId}
          style={{
            width: '100%',
            marginTop: 20,
            padding: '10px',
            background: 'var(--brand)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {enviando ? 'Abriendo...' : 'Iniciar turno y entrar'}
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          style={{
            width: '100%',
            marginTop: 10,
            padding: '8px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
