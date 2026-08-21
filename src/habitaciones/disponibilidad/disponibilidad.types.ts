export interface ValidarDisponibilidadInput {
  hotelId: string;
  habitacionId: string;
  checkinPrevisto: string; // ISO datetime
  checkoutPrevisto: string; // ISO datetime
  /** id de reserva_habitacion a excluir (para permitir editar una reserva existente) */
  excluirReservaHabitacionId?: string;
}

export type MotivoBloqueo =
  | 'SOLAPA_RESERVA_EXISTENTE'
  | 'SIN_MARGEN_LIMPIEZA'
  | 'HABITACION_BLOQUEADA';

export interface ConflictoDisponibilidad {
  motivo: MotivoBloqueo;
  mensaje: string;
  reservaHabitacionId?: string;
  huesped?: string;
  checkinConflicto?: string;
  checkoutConflicto?: string;
  minutosFaltantes?: number;
}

export interface ResultadoDisponibilidad {
  disponible: boolean;
  conflicto?: ConflictoDisponibilidad;
}
