import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHotel } from '../contexts/HotelContext';

const NAV_ITEMS = [
  { to: '/habitaciones', label: 'Habitaciones', icon: '⊞' },
  { to: '/reservas', label: 'Reservas', icon: '📅' },
  { to: '/estadias', label: 'Estadías', icon: '🚪' },
  { to: '/caja', label: 'Caja', icon: '💵' },
  { to: '/tareas-hk', label: 'Tareas HK', icon: '🧹' },
  { to: '/cotizaciones', label: 'Cotizaciones', icon: '📄' },
];

export function Layout() {
  const { signOut } = useAuth();
  const { asignaciones, hotelActual, cambiarHotel } = useHotel();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 190,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface-1)',
          padding: '16px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
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

        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface-1)',
          }}
        >
          <select
            value={hotelActual?.hotelId ?? ''}
            onChange={(e) => cambiarHotel(e.target.value)}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '6px 10px',
              fontSize: 13,
              background: 'var(--surface-1)',
            }}
          >
            {asignaciones.map((a) => (
              <option key={a.hotelId} value={a.hotelId}>
                {a.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={() => signOut()}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'transparent',
              padding: '6px 12px',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            Cerrar sesión
          </button>
        </header>

        <main style={{ flex: 1, padding: 20 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
