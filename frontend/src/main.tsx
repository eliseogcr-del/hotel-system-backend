import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { App } from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';

// Selecciona todo el contenido de cualquier <input type="number"> al
// enfocarlo, en cualquier pantalla del sistema -- sin esto, tocar un campo
// que ya tiene un valor (ej. piso=1, aforo=2, o un 0 inicial) y escribir un
// dígito lo inserta AL LADO del valor existente en vez de reemplazarlo (ej.
// escribir "5" sobre un "0" da "05"), que es justo la molestia reportada:
// "escribo un numero y el 0 se pone a la izquierda". Un solo listener
// global en vez de repetir onFocus en los ~60 campos numéricos del
// frontend -- cubre también cualquier campo numérico que se agregue después.
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (el instanceof HTMLInputElement && el.type === 'number') {
    el.select();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
