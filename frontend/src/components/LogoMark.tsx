// Glifo "H" de Hospeda, dibujado con trazos (no depende de cómo cada
// navegador/fuente renderice la letra "H") -- se usa dentro del cuadrado de
// color ya existente en Layout.tsx/Login.tsx, solo el trazo blanco.
export function LogoGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="4" height="18" fill="currentColor" />
      <rect x="15" y="3" width="4" height="18" fill="currentColor" />
      <rect x="5" y="10" width="14" height="4" fill="currentColor" />
    </svg>
  );
}
