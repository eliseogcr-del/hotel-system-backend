import { useState, type ChangeEvent, type CSSProperties } from 'react';
import { api, ApiError } from '../lib/api';

// Tope del archivo que se deja elegir ANTES de comprimir -- solo para evitar
// que el navegador intente decodificar algo absurdamente pesado (una foto de
// celular normal pesa 2-8MB y entra sin problema). El peso final que
// realmente se guarda lo define comprimirImagen() de abajo.
const ARCHIVO_ORIGEN_MAX = 15_000_000;
// Lado más largo al que se reduce la imagen -- de sobra para una tarjeta/
// miniatura del panel, no hace falta más resolución que esa.
const DIMENSION_MAX = 1280;
// Peso aproximado (bytes) al que se apunta comprimiendo: se guarda como data
// URI en la misma columna de la base (igual patrón que hoteles.logo_url, sin
// bucket de storage -- ver comentario en sql/schema.sql), así que mientras
// más liviano, menos espacio ocupa el catálogo completo de habitaciones.
const PESO_OBJETIVO_BYTES = 200_000;

// Reduce cualquier imagen a JPEG, achicando resolución y bajando calidad
// hasta acercarse a PESO_OBJETIVO_BYTES (máximo 6 intentos, para no colgar
// el navegador con una imagen que simplemente no comprime más).
async function comprimirImagen(archivo: File): Promise<string> {
  const img = await cargarImagen(archivo);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');

  let escala = Math.min(1, DIMENSION_MAX / Math.max(img.width, img.height));
  let calidad = 0.75;
  let dataUrl = '';

  for (let intento = 0; intento < 6; intento++) {
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL('image/jpeg', calidad);

    const pesoAprox = (dataUrl.length * 3) / 4; // base64 -> bytes, aproximado
    if (pesoAprox <= PESO_OBJETIVO_BYTES) break;
    if (calidad > 0.4) calidad -= 0.15;
    else escala *= 0.8;
  }
  return dataUrl;
}

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

interface Props {
  hotelId: string;
  habitacionId: string;
  habNumero: number;
  tipoNombre?: string | null;
  foto1Url: string | null;
  foto2Url: string | null;
  onClose: () => void;
  onGuardado: (fotos: { foto1_url: string | null; foto2_url: string | null }) => void;
}

export function FotosHabitacionModal({
  hotelId,
  habitacionId,
  habNumero,
  tipoNombre,
  foto1Url,
  foto2Url,
  onClose,
  onGuardado,
}: Props) {
  const [foto1, setFoto1] = useState(foto1Url);
  const [foto2, setFoto2] = useState(foto2Url);
  const [subiendoSlot, setSubiendoSlot] = useState<1 | 2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  async function subir(slot: 1 | 2, e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      setError('El archivo debe ser una imagen');
      return;
    }
    if (archivo.size > ARCHIVO_ORIGEN_MAX) {
      setError('La imagen es demasiado pesada (máx. 15MB antes de comprimir)');
      return;
    }
    setError(null);
    setSubiendoSlot(slot);
    try {
      const fotoUrl = await comprimirImagen(archivo);
      await guardarFoto(slot, fotoUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar la imagen');
    } finally {
      setSubiendoSlot(null);
    }
  }

  async function quitar(slot: 1 | 2) {
    setSubiendoSlot(slot);
    setError(null);
    try {
      await guardarFoto(slot, null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar la foto');
    } finally {
      setSubiendoSlot(null);
    }
  }

  async function guardarFoto(slot: 1 | 2, fotoUrl: string | null) {
    await api.patch(`/hoteles/${hotelId}/habitaciones/${habitacionId}/foto`, { slot, fotoUrl });
    if (slot === 1) setFoto1(fotoUrl);
    else setFoto2(fotoUrl);
    onGuardado({
      foto1_url: slot === 1 ? fotoUrl : foto1,
      foto2_url: slot === 2 ? fotoUrl : foto2,
    });
  }

  function slotUI(slot: 1 | 2, fotoUrl: string | null) {
    const subiendo = subiendoSlot === slot;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <div
          style={{
            width: 220,
            height: 160,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt={`Foto ${slot} de la habitación ${habNumero}`}
              onClick={() => setZoomUrl(fotoUrl)}
              title="Ver en grande"
              style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
            />
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
              Sin foto
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ ...btnSecondary, cursor: subiendo ? 'default' : 'pointer', opacity: subiendo ? 0.6 : 1 }}>
            {subiendo ? 'Procesando...' : fotoUrl ? 'Reemplazar' : 'Subir foto'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => subir(slot, e)}
              disabled={subiendo}
              style={{ display: 'none' }}
            />
          </label>
          {fotoUrl && (
            <button type="button" onClick={() => quitar(slot)} disabled={subiendo} style={btnSecondary}>
              Quitar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>
          Fotos · Habitación {habNumero}
          {tipoNombre ? <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> ({tipoNombre})</span> : null}
        </h2>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Hasta 2 fotos por habitación. Se comprimen automáticamente al subirlas para ocupar poco espacio.
        </p>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          {slotUI(1, foto1)}
          {slotUI(2, foto2)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cerrar
          </button>
        </div>
      </div>

      {zoomUrl && (
        <div style={zoomOverlayStyle} onClick={(e) => { e.stopPropagation(); setZoomUrl(null); }}>
          <img src={zoomUrl} alt="Foto de la habitación en grande" style={zoomImgStyle} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoomUrl(null); }}
            style={zoomCerrarBtnStyle}
            title="Cerrar"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 16px',
  overflowY: 'auto',
  zIndex: 100,
};

const modalStyle: CSSProperties = {
  background: 'var(--form-bg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 24,
  width: '100%',
  maxWidth: 520,
};

const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
};

// Por encima del overlay del modal (zIndex 100) -- se abre sobre él, no en
// vez de él, para volver directo a los 2 slots al cerrar el zoom.
const zoomOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.85)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  zIndex: 200,
  cursor: 'zoom-out',
};

const zoomImgStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  borderRadius: 'var(--radius)',
};

const zoomCerrarBtnStyle: CSSProperties = {
  position: 'fixed',
  top: 16,
  right: 20,
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  color: '#fff',
  fontSize: 20,
  lineHeight: 1,
  width: 36,
  height: 36,
  borderRadius: '50%',
  cursor: 'pointer',
};
