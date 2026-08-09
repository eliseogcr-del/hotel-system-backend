import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { SupabaseService } from '../common/supabase/supabase.service';
import { CrearPersonalDto } from './dto/crear-personal.dto';
import { AsignarPersonalDto } from './dto/asignar-personal.dto';
import { ActualizarAsignacionDto } from './dto/actualizar-asignacion.dto';

const CODIGO_UNIQUE_VIOLATION = '23505';

@Injectable()
export class PersonalService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Crea un miembro de personal nuevo (o reutiliza su cuenta de Auth si ya
   * existe por email) y lo asigna a este hotel con un rol. Crear un usuario
   * de Supabase Auth es una operación de plataforma sin equivalente vía
   * RLS, así que se usa el cliente de servicio SOLO para esa llamada
   * puntual (mismo patrón documentado en SupabaseService.getServiceClient
   * y ya usado en CajaService para la herencia de saldo entre turnos). El
   * resto (insertar en `personal` y `personal_hotel`) pasa por el cliente
   * de la request y las policies de RLS para admins.
   */
  async crear(client: SupabaseClient, hotelId: string, dto: CrearPersonalDto) {
    const service = this.supabase.getServiceClient();

    const { data: existentes, error: listarError } = await service.auth.admin.listUsers();
    if (listarError) throw listarError;

    let authUser = existentes.users.find((u) => u.email === dto.email);
    let passwordGenerada: string | null = null;

    if (!authUser) {
      passwordGenerada = dto.password ?? crypto.randomBytes(9).toString('base64url');
      const { data: creado, error: crearError } = await service.auth.admin.createUser({
        email: dto.email,
        password: passwordGenerada,
        email_confirm: true,
      });
      if (crearError) throw crearError;
      authUser = creado.user;
    }

    // Si el correo ya tiene un usuario de Auth, puede que también ya tenga
    // fila en `personal` (ej. se le está asignando a un segundo hotel, o el
    // admin reintenta el alta) -> hay que reutilizarla, si no se fragmenta a
    // la misma persona en varias filas `personal` con el mismo auth_user_id.
    const { data: personalExistente, error: personalExistenteError } = await service
      .from('personal')
      .select('id, nombre, usuario, activo')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (personalExistenteError) throw personalExistenteError;

    let personal = personalExistente;
    if (!personal) {
      // Con el cliente de la request este insert fallaría: INSERT ... RETURNING
      // también exige que la fila nueva pase la policy de SELECT de `personal`,
      // y a esta altura la persona todavía no tiene fila en `personal_hotel`
      // que la vincule a este hotel (eso se crea recién abajo) -> quedaría
      // invisible para el propio admin que la está creando. Es la misma
      // operación de alta que ya usa el cliente de servicio para el usuario de
      // Auth, así que se resuelve igual.
      const { data: creado, error: personalError } = await service
        .from('personal')
        .insert({ auth_user_id: authUser.id, nombre: dto.nombre, usuario: dto.usuario, activo: true })
        .select('id, nombre, usuario, activo')
        .single();

      if (personalError) {
        if ((personalError as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
          throw new ConflictException('El nombre de usuario ya está en uso');
        }
        throw personalError;
      }
      personal = creado;
    }

    const { data: asignacion, error: asignacionError } = await client
      .from('personal_hotel')
      .insert({ personal_id: personal.id, hotel_id: hotelId, rol: dto.rol, activo: true })
      .select('id, rol, activo')
      .single();

    if (asignacionError) {
      if ((asignacionError as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
        throw new ConflictException('Esta persona ya tiene ese rol asignado en este hotel');
      }
      throw asignacionError;
    }

    return {
      personal,
      asignacion,
      email: dto.email,
      password: passwordGenerada,
    };
  }

  /**
   * Asigna a este hotel a alguien que ya es personal visible para el admin
   * que hace la request (ya sea porque ya trabaja en este hotel con otro
   * rol, o en otro hotel donde ese mismo admin también es admin).
   */
  async asignar(
    client: SupabaseClient,
    hotelId: string,
    personalId: string,
    dto: AsignarPersonalDto,
  ) {
    const { data: personalRow, error: personalError } = await client
      .from('personal')
      .select('id, nombre, usuario, activo')
      .eq('id', personalId)
      .maybeSingle();
    if (personalError) throw personalError;
    if (!personalRow) {
      throw new NotFoundException('No se encontró esa persona (o no tienes visibilidad sobre ella)');
    }

    const { data: asignacion, error: asignacionError } = await client
      .from('personal_hotel')
      .insert({ personal_id: personalId, hotel_id: hotelId, rol: dto.rol, activo: true })
      .select('id, rol, activo')
      .single();

    if (asignacionError) {
      if ((asignacionError as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) {
        throw new ConflictException('Esta persona ya tiene ese rol asignado en este hotel');
      }
      throw asignacionError;
    }

    return { personal: personalRow, asignacion };
  }

  async listar(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('personal_hotel')
      .select('id, rol, activo, personal(id, nombre, usuario, activo)')
      .eq('hotel_id', hotelId)
      .order('rol', { ascending: true });
    if (error) throw error;
    return data;
  }

  async actualizarAsignacion(
    client: SupabaseClient,
    hotelId: string,
    personalHotelId: string,
    dto: ActualizarAsignacionDto,
  ) {
    const cambios: Record<string, unknown> = {};
    if (dto.rol !== undefined) cambios.rol = dto.rol;
    if (dto.activo !== undefined) cambios.activo = dto.activo;

    if (Object.keys(cambios).length === 0) {
      throw new BadRequestException('No se enviaron cambios');
    }

    const { data, error } = await client
      .from('personal_hotel')
      .update(cambios)
      .eq('id', personalHotelId)
      .eq('hotel_id', hotelId)
      .select('id, rol, activo, personal(id, nombre, usuario)')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException('Asignación no encontrada en este hotel');
    return data;
  }
}
