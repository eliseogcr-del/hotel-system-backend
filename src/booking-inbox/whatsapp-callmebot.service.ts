import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * CallMeBot: servicio gratuito para mandarte avisos de WhatsApp a un solo
 * número propio (no para mensajería a clientes -- no es la API oficial de
 * Meta, sin SLA ni garantía, pensado justo para este caso de uso). Se activa
 * agregando su contacto y pidiéndole una API key por WhatsApp una sola vez.
 */
@Injectable()
export class WhatsappCallmebotService {
  private readonly logger = new Logger(WhatsappCallmebotService.name);
  private readonly phone: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.phone = this.config.get<string>('CALLMEBOT_PHONE', '');
    this.apiKey = this.config.get<string>('CALLMEBOT_APIKEY', '');
  }

  get habilitado(): boolean {
    return !!this.phone && !!this.apiKey;
  }

  // Nunca tira la app abajo si CallMeBot falla (caído, rate-limit, etc.) --
  // mismo criterio "best effort" que ya se usa en este backend para tareas
  // en segundo plano (ver procesar-salidas-vencidas). El resultado se
  // guarda en importaciones_canal para poder diagnosticar si no llegó.
  async enviar(mensaje: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.habilitado) {
      return { ok: false, error: 'CallMeBot no configurado (falta CALLMEBOT_APIKEY)' };
    }
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(this.phone)}&text=${encodeURIComponent(mensaje)}&apikey=${encodeURIComponent(this.apiKey)}`;
    try {
      const resp = await fetch(url);
      const texto = await resp.text();
      if (!resp.ok) {
        this.logger.warn(`CallMeBot respondió ${resp.status}: ${texto.slice(0, 200)}`);
        return { ok: false, error: `HTTP ${resp.status}: ${texto.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      this.logger.warn(`Error llamando a CallMeBot: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    }
  }
}
