import { Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

export interface MovimientoCaja {
  id: string;
  sesion_turno_id: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  concepto: string;
  metodo_pago: string;
  notas: string | null;
  created_at: string;
}

// El concepto de caja no distingue de qué cargo viene un pago genérico
// (alquiler, cochera, mascota, ajustes, saldos pendientes... todo cae como
// 'Pago de huésped' -- ver EstadiasService.registrarMovimiento): por eso
// esa etiqueta se deja explícita aquí en vez de fingir una categoría por
// habitación/cochera/mascota que el sistema no registra por separado.
// Bazar y desayuno sí quedan aparte porque generan su propio concepto
// cuando se pagan al momento.
const CONCEPTO_LABEL: Record<string, string> = {
  'Pago de huésped': 'Pagos de estadía (alquiler, cochera, mascota y otros cargos)',
  'Consumo de bazar pagado al momento': 'Bazar',
  'Desayuno pagado al momento': 'Desayuno',
};

@Injectable()
export class ReportesService {
  async reporteCaja(client: SupabaseClient, hotelId: string, fecha: string, turnoId?: string) {
    let query = client
      .from('sesiones_turno')
      .select(
        `
        id, fecha, saldo_inicial, saldo_final, estado, abierta_en, cerrada_en,
        turno_id, turnos(nombre, hora_inicio, hora_fin),
        personal_hotel!inner(hotel_id, personal(nombre))
      `,
      )
      .eq('personal_hotel.hotel_id', hotelId)
      .eq('fecha', fecha)
      .order('abierta_en', { ascending: true });
    if (turnoId) query = query.eq('turno_id', turnoId);

    const { data: sesiones, error } = await query;
    if (error) throw error;

    const sesionIds = (sesiones ?? []).map((s) => s.id);
    let movimientos: MovimientoCaja[] = [];
    if (sesionIds.length > 0) {
      const { data, error: movError } = await client
        .from('movimientos_caja')
        .select('id, sesion_turno_id, tipo, monto, concepto, metodo_pago, notas, created_at')
        .in('sesion_turno_id', sesionIds)
        .order('created_at', { ascending: true });
      if (movError) throw movError;
      movimientos = data ?? [];
    }

    const sesionesConDetalle = (sesiones ?? []).map((s) => {
      const propios = movimientos.filter((m) => m.sesion_turno_id === s.id);
      const ingresos = propios.filter((m) => m.tipo === 'ingreso');
      const egresos = propios.filter((m) => m.tipo === 'egreso');
      // Mismo criterio que CajaService.obtenerDetalle(): el saldo que se
      // traspasa entre turnos es solo el efectivo físico, así que la sesión
      // aún abierta necesita este cálculo (saldo_final queda null hasta el
      // cierre).
      const ingresosEfectivo = ingresos.filter((m) => m.metodo_pago === 'efectivo');
      const egresosEfectivo = egresos.filter((m) => m.metodo_pago === 'efectivo');
      const saldoActual =
        Number(s.saldo_inicial) + this.sumar(ingresosEfectivo) - this.sumar(egresosEfectivo);
      return {
        id: s.id,
        turno: s.turnos,
        recepcionista: (s as any).personal_hotel?.personal?.nombre ?? '—',
        estado: s.estado,
        abiertaEn: s.abierta_en,
        cerradaEn: s.cerrada_en,
        saldoInicial: Number(s.saldo_inicial),
        saldoFinal: s.saldo_final !== null ? Number(s.saldo_final) : null,
        saldoActual,
        totalIngresos: this.sumar(ingresos),
        totalEgresos: this.sumar(egresos),
        ingresosPorConcepto: this.agruparPorConcepto(ingresos),
        egresosPorConcepto: this.agruparPorConcepto(egresos),
        movimientos: propios,
      };
    });

    const todosIngresos = movimientos.filter((m) => m.tipo === 'ingreso');
    const todosEgresos = movimientos.filter((m) => m.tipo === 'egreso');

    return {
      fecha,
      turnoId: turnoId ?? null,
      sesiones: sesionesConDetalle,
      resumen: {
        totalIngresos: this.sumar(todosIngresos),
        totalEgresos: this.sumar(todosEgresos),
        ingresosPorConcepto: this.agruparPorConcepto(todosIngresos),
        egresosPorConcepto: this.agruparPorConcepto(todosEgresos),
      },
    };
  }

  private sumar(movimientos: { monto: number }[]) {
    return movimientos.reduce((acc, m) => acc + Number(m.monto), 0);
  }

  private agruparPorConcepto(movimientos: { concepto: string; monto: number }[]) {
    const mapa = new Map<string, number>();
    for (const m of movimientos) {
      const etiqueta = CONCEPTO_LABEL[m.concepto] ?? m.concepto;
      mapa.set(etiqueta, (mapa.get(etiqueta) ?? 0) + Number(m.monto));
    }
    return [...mapa.entries()]
      .map(([concepto, monto]) => ({ concepto, monto }))
      .sort((a, b) => b.monto - a.monto);
  }
}
