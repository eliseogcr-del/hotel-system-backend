import { useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface Nota {
  id: string;
  fecha_hora: string;
  descripcion: string;
  usuario_escribio: string;
  tipo: 'Informativa' | 'Repetitiva' | 'Mensajeria';
  dirigido_a: 'Recepcionista' | 'HK' | 'Huesped';
  // Para Repetitiva
  fecha_hora_inicio_repeticion?: string;
  fecha_hora_fin_repeticion?: string;
  // Para Mensajeria
  fecha_hora_envio?: string;
  celular_destino?: string;
  adjuntos?: string[]; // URLs de cotizaciones o imágenes
  telefonos_adicionales?: string[]; // Otros números a quienes enviar
}

interface CrearNotaDTO {
  descripcion: string;
  tipo: 'Informativa' | 'Repetitiva' | 'Mensajeria';
  dirigido_a: 'Recepcionista' | 'HK' | 'Huesped';
  // Para Repetitiva
  fecha_hora_inicio_repeticion?: string;
  fecha_hora_fin_repeticion?: string;
  // Para Mensajeria
  celular_destino?: string;
  adjuntos?: string[];
  telefonos_adicionales?: string[];
}

const TIPO_COLOR: Record<string, { bg: string; text: string }> = {
  Informativa: { bg: 'var(--disponible-bg)', text: 'var(--disponible-text)' },
  Repetitiva: { bg: 'var(--limpieza-bg)', text: 'var(--limpieza-text)' },
  Mensajeria: { bg: 'var(--ocupada-bg)', text: 'var(--ocupada-text)' },
};

const DIRIGIDO_A_ICONO: Record<string, string> = {
  Recepcionista: '👨‍💼',
  HK: '🧹',
  Huesped: '🏨',
};

export function Notas() {
  const { hotelActual } = useHotel();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [formularioData, setFormularioData] = useState<CrearNotaDTO>({
    descripcion: '',
    tipo: 'Informativa',
    dirigido_a: 'Recepcionista',
    fecha_hora_inicio_repeticion: undefined,
    fecha_hora_fin_repeticion: undefined,
    celular_destino: undefined,
    adjuntos: [],
    telefonos_adicionales: [],
  });

  useEffect(() => {
    if (!hotelActual) return;
    cargarNotas();
  }, [hotelActual]);

  const cargarNotas = () => {
    if (!hotelActual) return;
    setLoading(true);
    setError(null);
    api
      .get<Nota[]>(`/hoteles/${hotelActual.hotelId}/notas`)
      .then(setNotas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar notas'))
      .finally(() => setLoading(false));
  };

  const manejarCambio = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    setFormularioData((prev) => {
      if (type === 'checkbox') {
        return { ...prev, [name]: checked };
      }
      // Manejo especial para arrays (adjuntos, telefonos_adicionales)
      if (name === 'adjuntos' || name === 'telefonos_adicionales') {
        // Para simplificar, asumimos que son campos de texto separados por comas
        const arrayValue = value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
        return { ...prev, [name]: arrayValue };
      }
      return { ...prev, [name]: value };
    });
  };

  const manejarGuardar = async () => {
    if (!hotelActual || !formularioData.descripcion.trim()) return;

    try {
      const nuevaNota: CrearNotaDTO = {
        ...formularioData,
        // Convertir fechas vacías a undefined
        fecha_hora_inicio_repeticion: formularioData.fecha_hora_inicio_repeticion || undefined,
        fecha_hora_fin_repeticion: formularioData.fecha_hora_fin_repeticion || undefined,
        celular_destino: formularioData.celular_destino || undefined,
        // Asegurar que los arrays no sean undefined
        adjuntos: formularioData.adjuntos || [],
        telefonos_adicionales: formularioData.telefonos_adicionales || [],
      };

      await api.post<Nota>(`/hoteles/${hotelActual.hotelId}/notas`, nuevaNota);
      setFormularioAbierto(false);
      setFormularioData({
        descripcion: '',
        tipo: 'Informativa',
        dirigido_a: 'Recepcionista',
        fecha_hora_inicio_repeticion: undefined,
        fecha_hora_fin_repeticion: undefined,
        celular_destino: undefined,
        adjuntos: [],
        telefonos_adicionales: [],
      });
      cargarNotas(); // Recargar lista
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar nota');
    }
  };

  const formatoFechaHora = (isoString: string | undefined): string => {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  };

  if (!hotelActual) return null;

  return (
    <div>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Notas</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button
          onClick={() => setFormularioAbierto(true)}
          style={{
            background: 'var(--brand)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + Nueva Nota
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {loading && <p style={{ color: 'var(--text-muted)' }}>Cargando notas...</p>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notas.map((nota) => (
            <div
              key={nota.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '4px 12px',
                padding: '10px 14px',
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200 }}>
                <div>
                  <strong>{nota.descripcion}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>
                    {DIRIGIDO_A_ICONO[nota.dirigido_a]} {nota.dirigido_a}
                    {' · '}
                    <span
                      style={{
                        background: TIPO_COLOR[nota.tipo].bg,
                        color: TIPO_COLOR[nota.tipo].text,
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 999,
                        fontWeight: 500,
                      }}
                    >
                      {nota.tipo}
                    </span>
                  </span>
                  <br />
                  <span>
                    👤 {nota.usuario_escribio} · 📅 {formatoFechaHora(nota.fecha_hora)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                {nota.tipo === 'Repetitiva' && (
                  <>
                    🔁 Repetitiva: {formatoFechaHora(nota.fecha_hora_inicio_repeticion)} →{' '}
                    {formatoFechaHora(nota.fecha_hora_fin_repeticion)}
                  </>
                )}
                {nota.tipo === 'Mensajeria' && (
                  <>
                    📱 Envío: {formatoFechaHora(nota.fecha_hora_envio)} · {' '}
                    {nota.celular_destino || 'Sin destino'}
                    {nota.adjuntos?.length > 0 && (
                      <>
                        {' · '}
                        📎 {nota.adjuntos.length} adjunto{s}
                      </>
                    )}
                    {nota.telefonos_adicionales?.length > 0 && (
                      <>
                        {' · '}
                        📞 {nota.telefonos_adicionales.length} tel. adicionales
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {notas.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
              No hay notas aún.
            </p>
          )}
        </div>
      )}

      {/* Modal para crear/editar nota */}
      {formularioAbierto && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--surface-0, var(--surface-1))',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '24px',
            width: '100%',
            maxWidth: '480px',
            boxSizing: 'border-box',
          }}>
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>Nueva Nota</h2>

            <form onSubmit={(e) => {
              e.preventDefault();
              manejarGuardar();
            }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Descripción
                </label>
                <textarea
                  name="descripcion"
                  value={formularioData.descripcion}
                  onChange={manejarCambio}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Tipo de Nota
                </label>
                <select
                  name="tipo"
                  value={formularioData.tipo}
                  onChange={manejarCambio}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="Informativa">Informativa</option>
                  <option value="Repetitiva">Repetitiva</option>
                  <option value="Mensajeria">Mensajería</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Dirigido a
                </label>
                <select
                  name="dirigido_a"
                  value={formularioData.dirigido_a}
                  onChange={manejarCambio}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="Recepcionista">Recepcionista</option>
                  <option value="HK">HK</option>
                  <option value="Huesped">Huesped</option>
                </select>
              </div>

              {/* Campos condicionales para Repetitiva */}
              {formularioData.tipo === 'Repetitiva' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Fecha y hora de inicio de repetición
                    </label>
                    <input
                      type="datetime-local"
                      name="fecha_hora_inicio_repeticion"
                      value={formularioData.fecha_hora_inicio_repeticion || ''}
                      onChange={manejarCambio}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Fecha y hora de fin de repetición
                    </label>
                    <input
                      type="datetime-local"
                      name="fecha_hora_fin_repeticion"
                      value={formularioData.fecha_hora_fin_repeticion || ''}
                      onChange={manejarCambio}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </>
              )}

              {/* Campos condicionales para Mensajeria */}
              {formularioData.tipo === 'Mensajeria' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Fecha y hora de envío (opcional, se establece automáticamente al enviar)
                    </label>
                    <input
                      type="datetime-local"
                      name="fecha_hora_envio"
                      value={formularioData.fecha_hora_envio || ''}
                      onChange={manejarCambio}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Celular de destino (WhatsApp)
                    </label>
                    <input
                      type="tel"
                      name="celular_destino"
                      value={formularioData.celular_destino || ''}
                      onChange={manejarCambio}
                      placeholder="+51 999 888 777"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Nota: El envío por WhatsApp requiere configuración previa del integrado.
                    </p>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Adjuntos (cotizaciones o imágenes - URLs separadas por comas)
                    </label>
                    <input
                      type="text"
                      name="adjuntos"
                      value={formularioData.adjuntos.join(', ')}
                      onChange={manejarCambio}
                      placeholder="https://ejemplo.com/cotizacion.pdf, https://ejemplo.com/promocion.jpg"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Teléfonos adicionales (separados por comas)
                    </label>
                    <input
                      type="tel"
                      name="telefonos_adicionales"
                      value={formularioData.telefonos_adicionales.join(', ')}
                      onChange={manejarCambio}
                      placeholder="+51 999 111 222, +51 999 333 444"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setFormularioAbierto(false)}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 14px',
                    background: 'var(--brand)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Guardar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}