export type RolHotel = 'admin' | 'recepcion' | 'hk';

export interface AsignacionHotel {
  hotel_id: string;
  rol: RolHotel;
}

/**
 * Lo que queda disponible en request.user después del AuthGuard.
 * personalId + accessToken permiten que cada servicio use el cliente
 * de Supabase "a nombre del usuario" para que RLS filtre solo.
 */
export interface RequestUser {
  authUserId: string;
  accessToken: string;
  personalId: string;
  nombre: string;
  esSuperAdmin: boolean;
  asignaciones: AsignacionHotel[];
}
