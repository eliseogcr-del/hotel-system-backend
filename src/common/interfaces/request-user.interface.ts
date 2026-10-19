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
  // Ver migracion_organizaciones.sql: un admin de organización no tiene
  // necesariamente una fila en personal_hotel por cada hotel de su empresa
  // -- por eso AuthGuard sintetiza esas asignaciones (rol 'admin') dentro
  // de `asignaciones` para que RolesGuard no tenga que saber nada de
  // organizaciones. Estos dos campos quedan disponibles igual por si algún
  // endpoint necesita distinguir el origen (ej. una futura pantalla de
  // "Organizaciones").
  organizacionId: string | null;
  esAdminOrganizacion: boolean;
  asignaciones: AsignacionHotel[];
}
