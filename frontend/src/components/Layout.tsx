import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHotel } from '../contexts/HotelContext';
import { useIsMobile } from '../hooks/useIsMobile';

const NAV_ITEMS = [
  { to: '/habitaciones', label: 'Habitaciones', icon: '⊞' },
  { to: '/reservas', label: 'Reservas', icon: '📅' },
  { to: '/estadias', label: 'Estadías', icon: '🚪' },
  { to: '/caja', label: 'Caja', icon: '💵' },
  { to: '/tareas-hk', label: 'Tareas HK', icon: '🧹' },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: '📄' },
];

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

  const navItems = [...NAV_ITEMS];
  if (hotelActual?.rol === 'admin' || hotelActual?.rol === 'recepcion') {
    navItems.splice(1, 0, { to: '/huespedes', label: 'Huéspedes', icon: '🧑' });
  }
  if (hotelActual?.rol === 'admin') {
    navItems.push({ to: '/configuracion', label: 'Configuración', icon: '⚙' });
  }

  const sidebarVisible = !isMobile || navAbierto;

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
            borderRight: '1px solid var(--border)',
            background: 'var(--surface-1)',
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
                background: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 500,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              H
            </div>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Hotel Suite</span>
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
                color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                background: isActive ? 'var(--brand-bg)' : 'transparent',
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
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setNavAbierto((v) => !v)}
                aria-label="Abrir menú"
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'transparent',
                  padding: '6px 10px',
                  fontSize: 16,
                  lineHeight: 1,
                  flexShrink: 0,
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
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: isMobile ? 110 : 220,
                  }}
                >
                  {personalNombre}
                </div>
                {hotelActual && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {ROL_LABEL[hotelActual.rol] ?? hotelActual.rol}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => signOut()}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'transparent',
                padding: '6px 12px',
                fontSize: 13,
                color: 'var(--text-secondary)',
                flexShrink: 0,
              }}
            >
              {isMobile ? 'Salir' : 'Cerrar sesión'}
            </button>
          </div>
        </header>

        <main style={{ flex: 1, padding: isMobile ? 12 : 20, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
