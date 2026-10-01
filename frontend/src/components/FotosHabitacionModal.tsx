import { useState, type ChangeEvent, type CSSProperties } from 'react';
import { api, ApiError } from '../lib/api';

const FOTO_TIPOS_ACEPTADOS = ['image/png', 'image/jpeg', 'image/webp'];
// Mismo límite que el logo del hotel (Configuracion.tsx) -- imagen chica
// guardada como data URI, sin bucket de storage (ver comentario en
// sql/schema.sql, tabla habitaciones).
const FOTO_TAMANO_MAX = 1_500_000;

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

  async function subir(slot: 1 | 2, e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!FOTO_TIPOS_ACEPTADOS.includes(archivo.type)) {
      setError('La foto debe ser una imagen PNG, JPG o WEBP');
      return;
    }
    if (archivo.size > FOTO_TAMANO_MAX) {
      setError('La foto no puede pesar más de 1.5MB');
      return;
    }
    setError(null);
    const lector = new FileReader();
    lector.onload = () => guardar(slot, lector.result as string);
    lector.readAsDataURL(archivo);
  }

  async function guardar(slot: 1 | 2, fotoUrl: string | null) {
    setSubiendoSlot(slot);
    setError(null);
    try {
      await api.patch(`/hoteles/${hotelId}/habitaciones/${habitacionId}/foto`, { slot, fotoUrl });
      if (slot === 1) setFoto1(fotoUrl);
      else setFoto2(fotoUrl);
      onGuardado({
        foto1_url: slot === 1 ? fotoUrl : foto1,
        foto2_url: slot === 2 ? fotoUrl : foto2,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la foto');
    } finally {
      setSubiendoSlot(null);
    }
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
            <img src={fotoUrl} alt={`Foto ${slot} de la habitación ${habNumero}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
              Sin foto
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ ...btnSecondary, cursor: subiendo ? 'default' : 'pointer', opacity: subiendo ? 0.6 : 1 }}>
            {subiendo ? 'Subiendo...' : fotoUrl ? 'Reemplazar' : 'Subir foto'}
            <input
              type="file"
              accept={FOTO_TIPOS_ACEPTADOS.join(',')}
              onChange={(e) => subir(slot, e)}
              disabled={subiendo}
              style={{ display: 'none' }}
            />
          </label>
          {fotoUrl && (
            <button type="button" onClick={() => guardar(slot, null)} disabled={subiendo} style={btnSecondary}>
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
          Hasta 2 fotos por habitación, PNG/JPG/WEBP de hasta 1.5MB cada una.
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
