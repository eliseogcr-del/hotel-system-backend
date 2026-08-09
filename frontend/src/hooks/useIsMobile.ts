import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 768;

// Este codebase usa estilos 100% inline (sin hojas de estilo con clases), así
// que el responsive real (mostrar/ocultar, cambiar layout según ancho) se
// resuelve en JS con matchMedia en vez de @media queries en CSS.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
