import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Habitaciones } from './pages/Habitaciones';
import { Reservas } from './pages/Reservas';
import { Huespedes } from './pages/Huespedes';
import { ReservaDetalle } from './pages/ReservaDetalle';
import { Estadias } from './pages/Estadias';
import { EstadiaDetalle } from './pages/EstadiaDetalle';
import { Caja } from './pages/Caja';
import { TareasHk } from './pages/TareasHk';
import { Cotizaciones } from './pages/Cotizaciones';
import { CotizacionDetalle } from './pages/CotizacionDetalle';
import { Configuracion } from './pages/Configuracion';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/habitaciones" replace />} />
        <Route path="/habitaciones" element={<Habitaciones />} />
        <Route path="/reservas" element={<Reservas />} />
        <Route path="/huespedes" element={<Huespedes />} />
        <Route path="/reservas/:id" element={<ReservaDetalle />} />
        <Route path="/estadias" element={<Estadias />} />
        <Route path="/estadias/:id" element={<EstadiaDetalle />} />
        <Route path="/caja" element={<Caja />} />
        <Route path="/tareas-hk" element={<TareasHk />} />
        <Route path="/cotizaciones" element={<Cotizaciones />} />
        <Route path="/cotizaciones/:id" element={<CotizacionDetalle />} />
        <Route path="/configuracion" element={<Configuracion />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
