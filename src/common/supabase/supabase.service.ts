import { Injectable, Scope, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

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
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    this.serviceRoleKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    // Este proyecto ya migró al sistema nuevo de Supabase (JWT Signing
    // Keys): los access tokens se firman con una llave asimétrica
    // (ECC/P-256 hoy), no con el "Legacy JWT Secret" compartido -- así
    // que no hay ningún secreto que guardar acá. jose.createRemoteJWKSet
    // trae las llaves públicas del proyecto una vez y las cachea (con
    // refresco automático si aparece una llave nueva por rotación), así
    // que AuthGuard puede validar la firma localmente sin llamar a
    // Supabase Auth en cada request -- un bache de ese servicio (lento o
    // caído un momento) ya no puede tirar a nadie de su sesión.
    this.jwks = createRemoteJWKSet(
      new URL(`${this.url}/auth/v1/.well-known/jwks.json`),
    );
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
   * Supabase Auth), contra las llaves públicas del proyecto (JWKS).
   * Devuelve el id de auth.users (claim `sub`) si es válido. Se chequea
   * también aud: 'authenticated' -- es la misma verificación que hace
   * Supabase Auth del lado de ellos, para no aceptar un JWT válido pero
   * de otro propósito.
   */
  async verificarAccessToken(accessToken: string): Promise<{ userId: string }> {
    let payload: JWTPayload;
    try {
      const resultado = await jwtVerify(accessToken, this.jwks);
      payload = resultado.payload;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    if (aud !== 'authenticated' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    return { userId: payload.sub };
  }
}
