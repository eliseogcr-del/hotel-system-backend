import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestUser } from '../interfaces/request-user.interface';

/**
 * Se apoya en AuthGuard (debe ejecutarse después de él).
 *
 * El hotel relevante se busca, en este orden, en:
 *   1. request.params.hotelId
 *   2. request.body.hotel_id
 *   3. request.query.hotelId
 *
 * Si el endpoint no trae ningún hotelId (ej. "mis asignaciones") el guard
 * deja pasar y el filtrado real queda a cargo de RLS / el propio servicio.
 *
 * super_admin siempre pasa. Los demás deben tener, en `asignaciones`,
 * una fila para ESE hotel_id con alguno de los roles requeridos.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // endpoint sin restricción de rol explícita
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No autenticado');
    }

    if (user.esSuperAdmin) {
      return true;
    }

    const hotelId =
      (request.params && request.params.hotelId) ||
      (request.body && request.body.hotel_id) ||
      (request.query && (request.query.hotelId as string));

    if (!hotelId) {
      // Sin hotel en la request: dejamos pasar, RLS filtra el resultado.
      return true;
    }

    const tieneAcceso = user.asignaciones.some(
      (a) => a.hotel_id === hotelId && requiredRoles.includes(a.rol),
    );

    if (!tieneAcceso) {
      throw new ForbiddenException(
        `No tienes el rol requerido (${requiredRoles.join(', ')}) en este hotel`,
      );
    }

    return true;
  }
}
