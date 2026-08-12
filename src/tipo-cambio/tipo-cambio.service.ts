import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import * as https from 'https';
import { UpsertTipoCambioDto } from './dto/upsert-tipo-cambio.dto';

// Fuente oficial de SUNAT: un .txt simple (sin sesión, sin formulario) con
// una sola línea "DD/MM/YYYY|compra|venta|" del tipo de cambio del día.
// Es el mismo archivo que usan varias herramientas de terceros para
// automatizar esto en Perú -- mucho más estable que scrapear el formulario
// interactivo de e-consulta.sunat.gob.pe (que requiere sesión/viewstate).
const URL_SUNAT_TXT = 'https://www.sunat.gob.pe/a/txt/tipoCambio.txt';

// Se usa el módulo https nativo (no fetch) a propósito: fetch recién es
// global sin flags desde Node 18, y este proyecto no fija una versión de
// Node para el despliegue (sin engines en package.json, sin render.yaml).
// https.get funciona en cualquier versión sin agregar dependencias nuevas.
// El User-Agent explícito es porque algunos sitios .gob.pe rechazan el
// User-Agent por defecto de Node.
function obtenerTextoSunat(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      URL_SUNAT_TXT,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HotelSuiteBot/1.0)' }, timeout: 10000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`SUNAT respondió ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
  });
}

@Injectable()
export class TipoCambioService {
  // "Crear" es un upsert por fecha (la fecha es la llave primaria): el
  // admin puede corregir el tipo de cambio del día si se equivocó, sin
  // que eso viole la unicidad de fecha.
  async upsert(client: SupabaseClient, dto: UpsertTipoCambioDto) {
    const { data, error } = await client
      .from('tipo_cambio')
      .upsert(
        { fecha: dto.fecha, valor_compra: dto.valorCompra, valor_venta: dto.valorVenta },
        { onConflict: 'fecha' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listar(client: SupabaseClient, limite = 30) {
    const { data, error } = await client
      .from('tipo_cambio')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limite);
    if (error) throw error;
    return data;
  }

  // El más reciente registrado, sea o no el de hoy -- si el admin no cargó
  // el de hoy todavía, es mejor mostrar el último conocido (con su fecha
  // real y visible) que no mostrar nada.
  async obtenerVigente(client: SupabaseClient) {
    const { data, error } = await client
      .from('tipo_cambio')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Trae el tipo de cambio del día directo de SUNAT y lo guarda (upsert).
   * Se llama con el cliente de servicio (no el del usuario que dispara la
   * sincronización) porque cualquier rol puede activarla con solo tener la
   * app abierta -- el dato en sí viene de SUNAT, no del usuario, así que
   * no hay nada inseguro en que recepción/HK también puedan dispararlo.
   */
  async sincronizarDesdeSunat(client: SupabaseClient) {
    let texto: string;
    try {
      texto = (await obtenerTextoSunat()).trim();
    } catch (err) {
      throw new BadRequestException(
        `No se pudo obtener el tipo de cambio de SUNAT: ${err instanceof Error ? err.message : 'error de red'}`,
      );
    }

    // Formato esperado: "12/08/2026|3.364|3.372|"
    const [fechaTexto, compraTexto, ventaTexto] = texto.split('|');
    const [dd, mm, yyyy] = (fechaTexto ?? '').split('/');
    const valorCompra = Number(compraTexto);
    const valorVenta = Number(ventaTexto);
    if (!dd || !mm || !yyyy || Number.isNaN(valorCompra) || Number.isNaN(valorVenta)) {
      throw new BadRequestException('SUNAT devolvió un formato inesperado para el tipo de cambio');
    }

    const fecha = `${yyyy}-${mm}-${dd}`;
    return this.upsert(client, { fecha, valorCompra, valorVenta });
  }
}
