import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Habitaciones } from './pages/Habitaciones';
import { Reservas } from './pages/Reservas';
import { ReservaDetalle } from './pages/ReservaDetalle';
import { EnConstruccion } from './pages/EnConstruccion';

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
        <Route path="/reservas/:id" element={<ReservaDetalle />} />
        <Route path="/estadias" element={<EnConstruccion titulo="Estadías" />} />
        <Route path="/caja" element={<EnConstruccion titulo="Caja" />} />
        <Route path="/tareas-hk" element={<EnConstruccion titulo="Tareas HK" />} />
        <Route path="/cotizaciones" element={<EnConstruccion titulo="Cotizaciones" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
