import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface NotaRepetitiva {
  id: string;
  descripcion: string;
  fecha_hora_inicio_repeticion: string | null;
  fecha_hora_fin_repeticion: string | null;
  periodicidad_minutos: number | null;
  repite_diario: boolean;
  tipo: string;
}

// "YYYY-MM-DD" en hora del navegador (asumida Lima, ver el resto de
// Notas.tsx) -- para saber si una nota diaria ya se mostró HOY.
function comoYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
 * que reaparece con el texto de cada nota 'Repetitiva' del hotel. Dos
 * modos (ver Notas.tsx):
 * - Rango (repite_diario=false): cada periodicidad_minutos mientras el
 *   reloj esté dentro de fecha_hora_inicio_repeticion..fin.
 * - Diaria (repite_diario=true): una vez por día a la HORA de
 *   fecha_hora_inicio_repeticion, desde esa fecha hasta fin (o para
 *   siempre si no tiene fin) -- para no tener que recrear la nota cada día.
 * Un clic en cualquier parte del popup lo cierra; si hay más de una nota
 * vencida a la vez, se van mostrando una por una.
 *
 * Limitación real: esto vive en el navegador, no hay notificaciones push --
 * solo se dispara mientras la pestaña esté abierta (igual que el resto de
 * los avisos "en vivo" del sistema, ver POLL_ESTADO_TURNO_MS).
 */
export function RecordatorioNotas() {
  const { hotelActual } = useHotel();
  const [cola, setCola] = useState<NotaRepetitiva[]>([]);
  const notasActivas = useRef<NotaRepetitiva[]>([]);
  // Última vez (Date.now()) que se encoló cada nota en modo rango -- en
  // memoria nomás, se resetea si se recarga la página (a propósito: al
  // entrar de nuevo se quiere ver el recordatorio, no esperar el intervalo).
  const ultimaVezMostrada = useRef<Map<string, number>>(new Map());
  // Para modo diario: qué notas ya se mostraron HOY ("id:YYYY-MM-DD"), así
  // no se repite en cada TICK_MS una vez que ya se mostró una vez ese día.
  const mostradasHoy = useRef<Set<string>>(new Set());

  useEffect(() => {
    notasActivas.current = [];
    ultimaVezMostrada.current = new Map();
    mostradasHoy.current = new Set();
    setCola([]);
    if (!hotelActual) return;

    function cargar() {
      api
        .get<NotaRepetitiva[]>(`/hoteles/${hotelActual!.hotelId}/notas`)
        .then((notas) => {
          notasActivas.current = notas.filter(
            (n) =>
              n.tipo === 'Repetitiva' &&
              !!n.fecha_hora_inicio_repeticion &&
              (n.repite_diario || (!!n.periodicidad_minutos && !!n.fecha_hora_fin_repeticion)),
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
      const ahora = new Date();
      const ahoraMs = ahora.getTime();
      const debenMostrarse: NotaRepetitiva[] = [];

      for (const nota of notasActivas.current) {
        const inicio = new Date(nota.fecha_hora_inicio_repeticion!);

        if (nota.repite_diario) {
          if (ahoraMs < inicio.getTime()) continue; // todavía no llega su primera vez
          if (nota.fecha_hora_fin_repeticion && ahoraMs > new Date(nota.fecha_hora_fin_repeticion).getTime()) {
            continue; // ya pasó la fecha de fin
          }
          const horaObjetivoMin = inicio.getHours() * 60 + inicio.getMinutes();
          const horaActualMin = ahora.getHours() * 60 + ahora.getMinutes();
          if (horaActualMin < horaObjetivoMin) continue; // todavía no es la hora de hoy
          const clave = `${nota.id}:${comoYMD(ahora)}`;
          if (!mostradasHoy.current.has(clave)) {
            mostradasHoy.current.add(clave);
            debenMostrarse.push(nota);
          }
          continue;
        }

        // Modo rango: cada periodicidad_minutos mientras esté dentro del rango.
        const fin = new Date(nota.fecha_hora_fin_repeticion!).getTime();
        if (ahoraMs < inicio.getTime() || ahoraMs > fin) continue;
        const ultimaVez = ultimaVezMostrada.current.get(nota.id);
        const intervaloMs = nota.periodicidad_minutos! * 60_000;
        if (ultimaVez === undefined || ahoraMs - ultimaVez >= intervaloMs) {
          ultimaVezMostrada.current.set(nota.id, ahoraMs);
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
