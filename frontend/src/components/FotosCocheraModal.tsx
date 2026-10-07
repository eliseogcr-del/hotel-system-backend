import { useState, type ChangeEvent, type CSSProperties } from 'react';
import { api, ApiError } from '../lib/api';
import { ARCHIVO_ORIGEN_MAX, comprimirImagen } from '../lib/comprimirImagen';

// Medidas de referencia que el hotel ya maneja para cada tamaño de cochera
// -- se usan solo para precargar el campo de descripción la primera vez
// (cuando todavía está vacío); de ahí en más es texto libre, editable por
// si una cochera puntual difiere o se quiere agregar otro dato.
const MEDIDAS_SUGERIDAS: Record<'grande' | 'chica', string> = {
  grande: 'ANCHO: 2.10 m\nLARGO: 5.40 m\nALTURA: 2.25 m',
  chica: 'ANCHO: 2.12 m\nLARGO: 5.15 m\nALTURA: 2.40 m',
};

interface Props {
  hotelId: string;
  cocheraId: string;
  numero: string;
  tamano: 'grande' | 'chica';
  foto1Url: string | null;
  foto1Descripcion: string | null;
  foto2Url: string | null;
  foto2Descripcion: string | null;
  onClose: () => void;
  onGuardado: (fotos: {
    foto1_url: string | null;
    foto1_descripcion: string | null;
    foto2_url: string | null;
    foto2_descripcion: string | null;
  }) => void;
}

export function FotosCocheraModal({
  hotelId,
  cocheraId,
  numero,
  tamano,
  foto1Url,
  foto1Descripcion,
  foto2Url,
  foto2Descripcion,
  onClose,
  onGuardado,
}: Props) {
  const [foto1, setFoto1] = useState(foto1Url);
  const [foto2, setFoto2] = useState(foto2Url);
  const [desc1, setDesc1] = useState(foto1Descripcion ?? MEDIDAS_SUGERIDAS[tamano]);
  const [desc2, setDesc2] = useState(foto2Descripcion ?? MEDIDAS_SUGERIDAS[tamano]);
  const [desc1Guardada, setDesc1Guardada] = useState(foto1Descripcion ?? '');
  const [desc2Guardada, setDesc2Guardada] = useState(foto2Descripcion ?? '');
  const [subiendoSlot, setSubiendoSlot] = useState<1 | 2 | null>(null);
  const [guardandoDescSlot, setGuardandoDescSlot] = useState<1 | 2 | null>(null);
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
      await api.patch(`/hoteles/${hotelId}/cocheras/${cocheraId}/foto`, { slot, fotoUrl });
      if (slot === 1) setFoto1(fotoUrl);
      else setFoto2(fotoUrl);
      onGuardado({
        foto1_url: slot === 1 ? fotoUrl : foto1,
        foto1_descripcion: desc1Guardada || null,
        foto2_url: slot === 2 ? fotoUrl : foto2,
        foto2_descripcion: desc2Guardada || null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo procesar la imagen');
    } finally {
      setSubiendoSlot(null);
    }
  }

  async function quitarFoto(slot: 1 | 2) {
    setSubiendoSlot(slot);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/cocheras/${cocheraId}/foto`, { slot, fotoUrl: null });
      if (slot === 1) setFoto1(null);
      else setFoto2(null);
      onGuardado({
        foto1_url: slot === 1 ? null : foto1,
        foto1_descripcion: desc1Guardada || null,
        foto2_url: slot === 2 ? null : foto2,
        foto2_descripcion: desc2Guardada || null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo quitar la foto');
    } finally {
      setSubiendoSlot(null);
    }
  }

  async function guardarDescripcion(slot: 1 | 2, descripcion: string) {
    setGuardandoDescSlot(slot);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/cocheras/${cocheraId}/foto`, { slot, descripcion });
      if (slot === 1) setDesc1Guardada(descripcion);
      else setDesc2Guardada(descripcion);
      onGuardado({
        foto1_url: foto1,
        foto1_descripcion: slot === 1 ? descripcion || null : desc1Guardada || null,
        foto2_url: foto2,
        foto2_descripcion: slot === 2 ? descripcion || null : desc2Guardada || null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la descripción');
    } finally {
      setGuardandoDescSlot(null);
    }
  }

  function slotUI(
    slot: 1 | 2,
    fotoUrl: string | null,
    descripcion: string,
    setDescripcion: (v: string) => void,
    descripcionGuardada: string,
  ) {
    const subiendo = subiendoSlot === slot;
    const guardandoDesc = guardandoDescSlot === slot;
    const descripcionCambio = descripcion.trim() !== descripcionGuardada.trim();
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: 220 }}>
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
              alt={`Foto ${slot} de la cochera ${numero}`}
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
            <button type="button" onClick={() => quitarFoto(slot)} disabled={subiendo} style={btnSecondary}>
              Quitar
            </button>
          )}
        </div>
        <div style={{ width: '100%' }}>
          <label style={{ fontSize: 10.5, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>
            Descripción (ej. medidas)
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={4}
            style={descripcionStyle}
          />
          <button
            type="button"
            onClick={() => guardarDescripcion(slot, descripcion)}
            disabled={guardandoDesc || !descripcionCambio}
            style={{ ...btnSecondary, marginTop: 6, width: '100%', opacity: descripcionCambio ? 1 : 0.5 }}
          >
            {guardandoDesc ? 'Guardando...' : 'Guardar descripción'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>
          Fotos · Cochera {numero}
          <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> ({tamano})</span>
        </h2>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Hasta 2 fotos por cochera, cada una con su propia descripción (ej. medidas). Las fotos se comprimen
          automáticamente al subirlas.
        </p>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          {slotUI(1, foto1, desc1, setDesc1, desc1Guardada)}
          {slotUI(2, foto2, desc2, setDesc2, desc2Guardada)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cerrar
          </button>
        </div>
      </div>

      {zoomUrl && (
        <div style={zoomOverlayStyle} onClick={(e) => { e.stopPropagation(); setZoomUrl(null); }}>
          <img src={zoomUrl} alt="Foto de la cochera en grande" style={zoomImgStyle} />
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

const descripcionStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
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
