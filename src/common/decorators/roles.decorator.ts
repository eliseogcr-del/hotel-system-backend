import { SetMetadata } from '@nestjs/common';
import { RolHotel } from '../interfaces/request-user.interface';

export const ROLES_KEY = 'roles';

/**
 * Uso: @Roles('admin', 'recepcion')
 * El super_admin siempre pasa, sin importar qué roles se listen aquí
 * (se resuelve en RolesGuard).
 */
export const Roles = (...roles: RolHotel[]) => SetMetadata(ROLES_KEY, roles);
