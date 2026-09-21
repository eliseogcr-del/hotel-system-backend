// Colores por canal de la reserva -- compartido entre el calendario de
// Reservas (leyenda + barras) y el indicador en las tarjetas de
// Habitaciones. creadoPorAgente tiene prioridad sobre origen: una reserva
// creada por el agente de WhatsApp sigue teniendo origen='whatsapp', pero
// se distingue como "agente", no como "WhatsApp atendido por una persona".
export const COLOR_ORIGEN_AGENTE = '#f59e0b'; // naranja
export const COLOR_ORIGEN_WHATSAPP = '#16a34a'; // verde
export const COLOR_ORIGEN_OTA = '#7c3aed'; // morado (Booking/Airbnb)
export const COLOR_ORIGEN_OTRO = '#374151'; // gris oscuro (teléfono, directo, walk-in...)

export const LEYENDA_COLORES_ORIGEN: { color: string; label: string }[] = [
  { color: COLOR_ORIGEN_AGENTE, label: 'Agente de WhatsApp' },
  { color: COLOR_ORIGEN_WHATSAPP, label: 'WhatsApp' },
  { color: COLOR_ORIGEN_OTA, label: 'Booking / Airbnb' },
  { color: COLOR_ORIGEN_OTRO, label: 'Otro' },
];

export function colorPorOrigen(item: { creadoPorAgente?: boolean; origen?: string | null }): string {
  if (item.creadoPorAgente) return COLOR_ORIGEN_AGENTE;
  if (item.origen === 'whatsapp') return COLOR_ORIGEN_WHATSAPP;
  if (item.origen === 'booking' || item.origen === 'airbnb') return COLOR_ORIGEN_OTA;
  return COLOR_ORIGEN_OTRO;
}

const ORIGEN_LABEL: Record<string, string> = {
  telefono: 'Teléfono',
  whatsapp: 'WhatsApp',
  booking: 'Booking',
  airbnb: 'Airbnb',
  directo: 'Directo',
  walkin: 'Walk-in',
};

// Para el título/badge de la tarjeta de Habitaciones (ver
// TarjetasHabitaciones en Habitaciones.tsx).
export function labelPorOrigen(item: { creadoPorAgente?: boolean; origen?: string | null }): string {
  if (item.creadoPorAgente) return 'Agente WhatsApp';
  if (!item.origen) return 'Otro';
  return ORIGEN_LABEL[item.origen] ?? item.origen;
}
