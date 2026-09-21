import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface NotaRepetitiva {
  id: string;
  descripcion: string;
  fecha_hora_inicio_repeticion: string | null;
  fecha_hora_fin_repeticion: string | null;
  periodicidad_minutos: number | null;
  tipo: string;
}

// Cada cuánto se refresca la lista de notas del hotel (para detectar notas
// repetitivas nuevas/editadas sin recargar la página) -- mismo criterio que
// POLL_ESTADO_TURNO_MS en Layout.tsx.
const POLL_NOTAS_MS = 60_000;

// Cada cuánto se revisa si alguna nota repetitiva ya debe volver a
// mostrarse. Tiene que ser más chico que la periodicidad mínima que ofrece
// el formulario (1 minuto, ver Notas.tsx) para no atrasarse.
const TICK_MS = 15_000;

/**
 * Popup global (montado una sola vez en Layout.tsx, fuera del <Outlet />)
 * que reaparece con el texto de cada nota 'Repetitiva' del hotel mientras
 * el reloj esté dentro de su fecha_hora_inicio_repeticion..fin, cada
 * periodicidad_minutos. Un clic en cualquier parte del popup lo cierra; si
 * hay más de una nota vencida a la vez, se van mostrando una por una.
 *
 * Limitación real: esto vive en el navegador, no hay notificaciones push --
 * solo se dispara mientras la pestaña esté abierta (igual que el resto de
 * los avisos "en vivo" del sistema, ver POLL_ESTADO_TURNO_MS).
 */
export function RecordatorioNotas() {
  const { hotelActual } = useHotel();
  const [cola, setCola] = useState<NotaRepetitiva[]>([]);
  const notasActivas = useRef<NotaRepetitiva[]>([]);
  // Última vez (Date.now()) que se encoló cada nota -- en memoria nomás,
  // se resetea si se recarga la página (a propósito: al entrar de nuevo se
  // quiere ver el recordatorio, no esperar a que se cumpla el intervalo).
  const ultimaVezMostrada = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    notasActivas.current = [];
    ultimaVezMostrada.current = new Map();
    setCola([]);
    if (!hotelActual) return;

    function cargar() {
      api
        .get<NotaRepetitiva[]>(`/hoteles/${hotelActual!.hotelId}/notas`)
        .then((notas) => {
          notasActivas.current = notas.filter(
            (n) =>
              n.tipo === 'Repetitiva' &&
              !!n.periodicidad_minutos &&
              !!n.fecha_hora_inicio_repeticion &&
              !!n.fecha_hora_fin_repeticion,
          );
        })
        .catch(() => {
          // Si falla la consulta simplemente no se muestran recordatorios
          // hasta el próximo intento -- no es razón para interrumpir a
          // quien esté usando el sistema con un error de este popup.
        });
    }
    cargar();
    const intervalo = setInterval(cargar, POLL_NOTAS_MS);
    return () => clearInterval(intervalo);
  }, [hotelActual]);

  useEffect(() => {
    const intervalo = setInterval(() => {
      const ahora = Date.now();
      const debenMostrarse: NotaRepetitiva[] = [];
      for (const nota of notasActivas.current) {
        const inicio = new Date(nota.fecha_hora_inicio_repeticion!).getTime();
        const fin = new Date(nota.fecha_hora_fin_repeticion!).getTime();
        if (ahora < inicio || ahora > fin) continue;
        const ultimaVez = ultimaVezMostrada.current.get(nota.id);
        const intervaloMs = nota.periodicidad_minutos! * 60_000;
        if (ultimaVez === undefined || ahora - ultimaVez >= intervaloMs) {
          ultimaVezMostrada.current.set(nota.id, ahora);
          debenMostrarse.push(nota);
        }
      }
      if (debenMostrarse.length > 0) {
        setCola((prev) => [...prev, ...debenMostrarse]);
      }
    }, TICK_MS);
    return () => clearInterval(intervalo);
  }, []);

  if (cola.length === 0) return null;
  const actual = cola[0];

  return (
    <div
      onClick={() => setCola((prev) => prev.slice(1))}
      role="alertdialog"
      aria-label="Recordatorio"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 2000,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          background: 'var(--surface-0, var(--surface-1))',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 420,
          boxSizing: 'border-box',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>🔁 Recordatorio</p>
        <p style={{ fontSize: 16, fontWeight: 500, margin: 0, whiteSpace: 'pre-wrap' }}>{actual.descripcion}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '16px 0 0' }}>
          Clic en cualquier parte para cerrar{cola.length > 1 ? ` (quedan ${cola.length - 1} más)` : ''}.
        </p>
      </div>
    </div>
  );
}
