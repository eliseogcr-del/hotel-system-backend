import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { RequestUser } from '../interfaces/request-user.interface';

/**
 * 1. Extrae el Bearer token del header Authorization.
 * 2. Le pregunta a Supabase Auth quién es (valida firma + expiración).
 * 3. Carga su fila en `personal` y sus asignaciones en `personal_hotel`.
 * 4. Cuelga todo en request.user para que los controllers/guards siguientes
 *    no vuelvan a pegarle a la base por esto.
 *
 * Importante: usamos el cliente "a nombre del usuario" (con su propio
 * access_token) para estas dos lecturas también, así que si por algún
 * motivo RLS bloqueara el acceso a su propia fila de personal, fallaría
 * aquí mismo de forma segura en vez de dejarlo pasar.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token de autenticación');
    }

    const accessToken = authHeader.substring('Bearer '.length);
    const client = this.supabase.getClientForRequest(accessToken);

    const { data: authData, error: authError } =
      await client.auth.getUser(accessToken);

    if (authError || !authData?.user) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const { data: personalRow, error: personalError } = await client
      .from('personal')
      .select('id, nombre, es_super_admin, activo')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (personalError || !personalRow || !personalRow.activo) {
      throw new UnauthorizedException(
        'Usuario autenticado pero sin perfil de personal activo',
      );
    }

    const { data: asignaciones } = await client
      .from('personal_hotel')
      .select('hotel_id, rol')
      .eq('personal_id', personalRow.id)
      .eq('activo', true);

    const user: RequestUser = {
      authUserId: authData.user.id,
      accessToken,
      personalId: personalRow.id,
      nombre: personalRow.nombre,
      esSuperAdmin: personalRow.es_super_admin,
      asignaciones: asignaciones ?? [],
    };

    (request as Request & { user: RequestUser }).user = user;
    return true;
  }
}
