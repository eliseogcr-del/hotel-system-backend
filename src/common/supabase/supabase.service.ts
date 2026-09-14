import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';

/**
 * Wrapper del cliente de Supabase.
 *
 * getClientForRequest(accessToken) crea un cliente que actúa CON el token
 * del usuario logueado -> respeta RLS tal como está definido en el schema
 * (aislamiento por hotel_id, aislamiento de caja por sesión de turno, etc).
 *
 * getServiceClient() usa la service_role key -> salta RLS. Solo se usa en
 * procesos internos de servidor (ej. el parser de correos de Booking/Airbnb
 * que necesita crear una reserva "pendiente_revision" sin que haya un
 * usuario humano logueado en ese momento).
 */
@Injectable({ scope: Scope.DEFAULT })
export class SupabaseService {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly serviceRoleKey: string;
  private readonly jwtSecret: string;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    this.serviceRoleKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    // Settings > API > JWT Settings > JWT Secret en el dashboard de
    // Supabase -- el mismo secreto con el que Supabase Auth firma los
    // access tokens (HS256). Con esto AuthGuard valida el token él mismo
    // (ver verificarAccessToken) en vez de preguntarle a Supabase por red
    // en cada request -- un bache del servicio de Auth de Supabase (lento
    // o caído un momento) ya no puede tirar a nadie de su sesión, porque
    // la base de datos (lo único que de verdad no se puede validar sin
    // red) sigue siendo la misma consulta de siempre, sin cambios.
    this.jwtSecret = this.config.getOrThrow<string>('SUPABASE_JWT_SECRET');
  }

  getClientForRequest(accessToken: string): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: { persistSession: false },
    });
  }

  getServiceClient(): SupabaseClient {
    return createClient(this.url, this.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  /**
   * Valida firma + expiración del access token localmente (sin llamar a
   * Supabase Auth). Devuelve el id de auth.users (claim `sub`) si es
   * válido. Los tokens de Supabase van firmados HS256 con este mismo
   * secreto y llevan aud: 'authenticated' -- se chequea también por si
   * llega un JWT válido pero de otro propósito (ej. el anon key no es un
   * JWT firmado con este secreto para un usuario, así que ya fallaría
   * antes, pero el chequeo de aud es la misma verificación que hace
   * Supabase Auth del lado de ellos).
   */
  verificarAccessToken(accessToken: string): { userId: string } {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(accessToken, this.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (payload.aud !== 'authenticated' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return { userId: payload.sub };
  }
}
