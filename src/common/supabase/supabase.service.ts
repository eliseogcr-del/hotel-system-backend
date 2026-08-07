import { Injectable, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

  constructor(private readonly config: ConfigService) {
    this.url = this.config.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = this.config.getOrThrow<string>('SUPABASE_ANON_KEY');
    this.serviceRoleKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
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
}
