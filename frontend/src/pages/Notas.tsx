import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useHotel } from '../contexts/HotelContext';

interface Nota {
  id: string;
  fecha_hora: string;
  descripcion: string;
  // NotasService.listar() trae usuario_escribio como el join a personal(id, nombre).
  usuario_escribio: { id: string; nombre: string } | null;
  tipo: 'Informativa' | 'Repetitiva' | 'Mensajeria';
  dirigido_a: 'Recepcionista' | 'HK' | 'Huesped';
  // Para Repetitiva
  fecha_hora_inicio_repeticion?: string;
  fecha_hora_fin_repeticion?: string;
  periodicidad_minutos?: number | null;
  repite_diario?: boolean;
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
  periodicidad_minutos?: number;
  repite_diario?: boolean;
  // Para Mensajeria
  celular_destino?: string;
  adjuntos?: string[];
  telefonos_adicionales?: string[];
}

// Opciones fijas que pidió el cliente para el popup de RecordatorioNotas.tsx.
const PERIODICIDAD_OPCIONES: { valor: number; label: string }[] = [
  { valor: 1, label: 'Cada minuto' },
  { valor: 5, label: 'Cada 5 minutos' },
  { valor: 10, label: 'Cada 10 minutos' },
  { valor: 15, label: 'Cada 15 minutos' },
  { valor: 60, label: 'Cada hora' },
];

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

function hoyYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convierte un ISO guardado en la base a lo que espera un <input
// type="datetime-local">: "YYYY-MM-DDTHH:mm" en hora del navegador, sin
// zona -- mismo formato que ya produce ese input al escribir a mano.
function aInputDatetimeLocal(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Para mostrar "a las HH:mm" en el modo diario -- solo interesa la hora,
// no la fecha (ver RecordatorioNotas.tsx).
function soloHora(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const labelFiltroStyle = { fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 } as const;

const inputFiltroStyle = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  fontSize: 13,
} as const;

export function Notas() {
  const { hotelActual } = useHotel();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [notaEditandoId, setNotaEditandoId] = useState<string | null>(null);
  const [formularioData, setFormularioData] = useState<CrearNotaDTO>({
    descripcion: '',
    tipo: 'Informativa',
    dirigido_a: 'Recepcionista',
    fecha_hora_inicio_repeticion: undefined,
    fecha_hora_fin_repeticion: undefined,
    periodicidad_minutos: undefined,
    repite_diario: false,
    celular_destino: undefined,
    adjuntos: [],
    telefonos_adicionales: [],
  });

  // Por defecto se ven las notas de hoy (hora Lima, ver
  // NotasService.listar()); el recepcionista puede ampliar el rango o
  // filtrar por tipo.
  const [filtroDesde, setFiltroDesde] = useState(hoyYMD);
  const [filtroHasta, setFiltroHasta] = useState(hoyYMD);
  const [filtroTipo, setFiltroTipo] = useState('');

  useEffect(() => {
    if (!hotelActual) return;
    cargarNotas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelActual, filtroDesde, filtroHasta, filtroTipo]);

  const cargarNotas = () => {
    if (!hotelActual) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filtroDesde) params.set('desde', filtroDesde);
    if (filtroHasta) params.set('hasta', filtroHasta);
    if (filtroTipo) params.set('tipo', filtroTipo);
    const query = params.toString() ? `?${params.toString()}` : '';
    api
      .get<Nota[]>(`/hoteles/${hotelActual.hotelId}/notas${query}`)
      .then(setNotas)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error al cargar notas'))
      .finally(() => setLoading(false));
  };

  const manejarCambio = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormularioData((prev) => {
      // Manejo especial para arrays (adjuntos, telefonos_adicionales)
      if (name === 'adjuntos' || name === 'telefonos_adicionales') {
        // Para simplificar, asumimos que son campos de texto separados por comas
        const arrayValue = value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
        return { ...prev, [name]: arrayValue };
      }
      if (name === 'periodicidad_minutos') {
        return { ...prev, periodicidad_minutos: value ? Number(value) : undefined };
      }
      return { ...prev, [name]: value };
    });
  };

  function alternarRepiteDiario(activo: boolean) {
    setFormularioData((prev) => ({
      ...prev,
      repite_diario: activo,
      // Modo diario no usa periodicidad_minutos -- se limpia para no
      // mandar un valor viejo que ya no aplica.
      periodicidad_minutos: activo ? undefined : prev.periodicidad_minutos,
    }));
  }

  function cerrarFormulario() {
    setFormularioAbierto(false);
    setNotaEditandoId(null);
    setFormularioData({
      descripcion: '',
      tipo: 'Informativa',
      dirigido_a: 'Recepcionista',
      fecha_hora_inicio_repeticion: undefined,
      fecha_hora_fin_repeticion: undefined,
      periodicidad_minutos: undefined,
      repite_diario: false,
      celular_destino: undefined,
      adjuntos: [],
      telefonos_adicionales: [],
    });
  }

  function abrirEdicion(nota: Nota) {
    setNotaEditandoId(nota.id);
    setFormularioData({
      descripcion: nota.descripcion,
      tipo: nota.tipo,
      dirigido_a: nota.dirigido_a,
      fecha_hora_inicio_repeticion: aInputDatetimeLocal(nota.fecha_hora_inicio_repeticion),
      fecha_hora_fin_repeticion: aInputDatetimeLocal(nota.fecha_hora_fin_repeticion),
      periodicidad_minutos: nota.periodicidad_minutos ?? undefined,
      repite_diario: nota.repite_diario ?? false,
      celular_destino: nota.celular_destino ?? undefined,
      adjuntos: nota.adjuntos ?? [],
      telefonos_adicionales: nota.telefonos_adicionales ?? [],
    });
    setFormularioAbierto(true);
  }

  const manejarGuardar = async () => {
    if (!hotelActual || !formularioData.descripcion.trim()) return;
    if (formularioData.tipo === 'Repetitiva' && !formularioData.fecha_hora_inicio_repeticion) {
      setError(
        formularioData.repite_diario
          ? 'Indica la hora a la que debe aparecer todos los días.'
          : 'Indica la fecha y hora de inicio de la repetición.',
      );
      return;
    }
    if (formularioData.tipo === 'Repetitiva' && !formularioData.repite_diario && !formularioData.periodicidad_minutos) {
      setError('Selecciona cada cuánto tiempo se debe repetir el mensaje.');
      return;
    }

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

      if (notaEditandoId) {
        await api.patch<Nota>(`/hoteles/${hotelActual.hotelId}/notas/${notaEditandoId}`, nuevaNota);
      } else {
        await api.post<Nota>(`/hoteles/${hotelActual.hotelId}/notas`, nuevaNota);
      }
      cerrarFormulario();
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <label style={labelFiltroStyle}>Desde</label>
          <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} style={inputFiltroStyle} />
        </div>
        <div>
          <label style={labelFiltroStyle}>Hasta</label>
          <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} style={inputFiltroStyle} />
        </div>
        <div>
          <label style={labelFiltroStyle}>Tipo</label>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={inputFiltroStyle}>
            <option value="">Todos los tipos</option>
            <option value="Informativa">Informativa</option>
            <option value="Repetitiva">Repetitiva</option>
            <option value="Mensajeria">Mensajería</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setFiltroDesde(hoyYMD());
            setFiltroHasta(hoyYMD());
            setFiltroTipo('');
          }}
          style={{ ...inputFiltroStyle, background: 'transparent', cursor: 'pointer' }}
        >
          Ver solo hoy
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
                    👤 {nota.usuario_escribio?.nombre ?? '—'} · 📅 {formatoFechaHora(nota.fecha_hora)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                {nota.tipo === 'Repetitiva' && nota.repite_diario && (
                  <>
                    🔁 Diaria a las {soloHora(nota.fecha_hora_inicio_repeticion)}, desde{' '}
                    {formatoFechaHora(nota.fecha_hora_inicio_repeticion)}
                    {nota.fecha_hora_fin_repeticion
                      ? ` hasta ${formatoFechaHora(nota.fecha_hora_fin_repeticion)}`
                      : ' (sin fecha de fin)'}
                  </>
                )}
                {nota.tipo === 'Repetitiva' && !nota.repite_diario && (
                  <>
                    🔁 Repetitiva: {formatoFechaHora(nota.fecha_hora_inicio_repeticion)} →{' '}
                    {formatoFechaHora(nota.fecha_hora_fin_repeticion)}
                    {nota.periodicidad_minutos ? ` · cada ${nota.periodicidad_minutos} min` : ''}
                  </>
                )}
                {nota.tipo === 'Mensajeria' && (
                  <>
                    📱 Envío: {formatoFechaHora(nota.fecha_hora_envio)} · {' '}
                    {nota.celular_destino || 'Sin destino'}
                    {nota.adjuntos && nota.adjuntos.length > 0 && (
                      <>
                        {' · '}
                        📎 {nota.adjuntos.length} adjunto{nota.adjuntos.length > 1 ? 's' : ''}
                      </>
                    )}
                    {nota.telefonos_adicionales && nota.telefonos_adicionales.length > 0 && (
                      <>
                        {' · '}
                        📞 {nota.telefonos_adicionales.length} tel. adicionales
                      </>
                    )}
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => abrirEdicion(nota)}
                style={{
                  padding: '5px 10px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Editar
              </button>
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
            <h2 style={{ fontSize: 18, marginBottom: 20 }}>{notaEditandoId ? 'Editar Nota' : 'Nueva Nota'}</h2>

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
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      marginBottom: 16,
                      background: 'var(--surface-2)',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!formularioData.repite_diario}
                      onChange={(e) => alternarRepiteDiario(e.target.checked)}
                    />
                    Repetir todos los días a esta hora (para no tener que volver a crearla)
                  </label>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {formularioData.repite_diario
                        ? 'Desde cuándo, y a qué hora aparece cada día'
                        : 'Fecha y hora de inicio de repetición'}
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
                      {formularioData.repite_diario
                        ? 'Hasta cuándo (opcional -- déjalo vacío para que sea indefinido)'
                        : 'Fecha y hora de fin de repetición'}
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

                  {formularioData.repite_diario ? (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-8px 0 16px' }}>
                      Va a aparecer una vez cada día a la hora indicada arriba, hasta la fecha de fin (o para
                      siempre si la dejas vacía).
                    </p>
                  ) : (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        Repetir cada
                      </label>
                      <select
                        name="periodicidad_minutos"
                        value={formularioData.periodicidad_minutos ?? ''}
                        onChange={manejarCambio}
                        required
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="" disabled>
                          Selecciona la periodicidad
                        </option>
                        {PERIODICIDAD_OPCIONES.map((op) => (
                          <option key={op.valor} value={op.valor}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Mientras esté dentro del rango de fechas, el mensaje aparecerá en pantalla con esta
                        frecuencia hasta que le hagan clic.
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Campos condicionales para Mensajeria */}
              {formularioData.tipo === 'Mensajeria' && (
                <>
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
                      value={(formularioData.adjuntos ?? []).join(', ')}
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
                      value={(formularioData.telefonos_adicionales ?? []).join(', ')}
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
                  onClick={cerrarFormulario}
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
                  {notaEditandoId ? 'Guardar cambios' : 'Guardar Nota'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}