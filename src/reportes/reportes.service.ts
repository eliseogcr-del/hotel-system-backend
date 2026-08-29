import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

// Perú (America/Lima) es UTC-5 todo el año -- mismo criterio que en
// estadias.service.ts para no comparar contra medianoche UTC por error.
const PERU_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

function desdeRelojLima(relojLima: Date): Date {
  return new Date(relojLima.getTime() + PERU_UTC_OFFSET_MS);
}

// Convierte una fecha 'YYYY-MM-DD' (hora Lima) al instante UTC real de esa
// medianoche en Lima.
function fechaLimaAInstante(fechaYMD: string): Date {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const relojLima = new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0));
  return desdeRelojLima(relojLima);
}

// YYYY-MM-DD (hora Lima) de un instante -- para agrupar cada movimiento en
// el día en que realmente ocurrió, sin desfasarse con la medianoche UTC.
function fechaLimaYMD(iso: string): string {
  const relojLima = new Date(new Date(iso).getTime() - PERU_UTC_OFFSET_MS);
  const anio = relojLima.getUTCFullYear();
  const mes = String(relojLima.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(relojLima.getUTCDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function sumarDiasYMD(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function rangoDiasYMD(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  let cursor = desde;
  while (cursor <= hasta) {
    dias.push(cursor);
    cursor = sumarDiasYMD(cursor, 1);
  }
  return dias;
}

const METODOS_PAGO = ['efectivo', 'transferencia', 'yape', 'tarjeta'];

// El concepto de movimientos_caja no distingue de qué cargo viene un pago
// genérico de estadía (alquiler, late, early, cochera, ajustes... todo cae
// como 'Pago de huésped', ver EstadiasService.registrarMovimiento) -- no
// hay forma confiable de separar "cuánto de este pago fue alquiler vs
// late" sin inventar precisión que el dato no tiene. Bazar, Desayuno y
// Anticipos sí quedan aparte porque generan su propio concepto.
const TIPO_INGRESO_LABEL: Record<string, string> = {
  'Pago de huésped': 'Alquiler y otros cargos de estadía',
  'Consumo de bazar pagado al momento': 'Bazar',
  'Desayuno pagado al momento': 'Desayuno',
  'Anticipo de reserva': 'Anticipos',
};
const TIPOS_INGRESO_ORDEN = [
  'Alquiler y otros cargos de estadía',
  'Bazar',
  'Desayuno',
  'Anticipos',
  'Otros',
];

function categoriaTipoIngreso(concepto: string): string {
  return TIPO_INGRESO_LABEL[concepto] ?? 'Otros';
}

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
// 'Pago de huésped' -- ver EstadiasService.registrarMovimiento). Para no
// perder esa distinción, si quien registró el pago escribió algo en
// "Notas" (ej. "Pago de cochera"), se usa ese texto como la categoría en
// vez del genérico; solo cuando no hay notas cae en el bucket genérico de
// abajo. Bazar y desayuno sí quedan aparte porque generan su propio
// concepto cuando se pagan al momento.
const CONCEPTO_LABEL: Record<string, string> = {
  'Pago de huésped': 'Pagos de estadía sin descripción',
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

    // sesionesConDetalle ya viene ordenada por abierta_en ascendente: la
    // primera sesión del día es con la que se abrió la caja esa fecha (el
    // saldo se hereda de sesión en sesión, ver CajaService.abrirTurno).
    const saldoInicialDia = sesionesConDetalle.length > 0 ? sesionesConDetalle[0].saldoInicial : null;

    // Igual que el saldoActual de cada sesión: solo efectivo, porque es lo
    // único que se traspasa físicamente de una caja a la siguiente (ver
    // comentario en CajaService.cerrarTurno). Si hay más de una sesión en
    // el rango filtrado, este es el saldo con el que queda la caja al final
    // de la última.
    const saldoActualDia =
      saldoInicialDia !== null
        ? saldoInicialDia +
          this.sumar(todosIngresos.filter((m) => m.metodo_pago === 'efectivo')) -
          this.sumar(todosEgresos.filter((m) => m.metodo_pago === 'efectivo'))
        : null;

    return {
      fecha,
      turnoId: turnoId ?? null,
      sesiones: sesionesConDetalle,
      resumen: {
        saldoInicialDia,
        saldoActualDia,
        totalIngresos: this.sumar(todosIngresos),
        totalEgresos: this.sumar(todosEgresos),
        ingresosPorConcepto: this.agruparPorConcepto(todosIngresos),
        egresosPorConcepto: this.agruparPorConcepto(todosEgresos),
      },
    };
  }

  /**
   * Solo admin: ventas del hotel entero (todas las recepcionistas y turnos)
   * en un rango de fechas, como dos tablas dinámicas -- una por método de
   * pago, otra por tipo de ingreso -- con los días del rango como columnas.
   * Se agrupa por el día real en que ocurrió cada movimiento (created_at en
   * hora Lima), no por sesiones_turno.fecha, porque un turno nocturno
   * (ej. 21:00–07:00) puede cruzar la medianoche y tener movimientos en dos
   * días calendario distintos.
   */
  async ventasDiarias(client: SupabaseClient, hotelId: string, desde: string, hasta: string) {
    if (hasta < desde) {
      throw new BadRequestException('La fecha "hasta" no puede ser anterior a "desde".');
    }

    const dias = rangoDiasYMD(desde, hasta);
    const desdeInstante = fechaLimaAInstante(desde);
    const hastaInstanteExclusivo = new Date(fechaLimaAInstante(hasta).getTime() + 24 * 60 * 60 * 1000);

    // sesiones_turno.fecha puede quedar hasta un día antes del rango pedido
    // (turno nocturno que abrió ayer y tiene movimientos ya en el día de
    // "desde") -- se ensancha la búsqueda de sesiones un día para no
    // perderlas, y el filtro preciso queda en movimientos_caja.created_at.
    const { data: sesiones, error: sesError } = await client
      .from('sesiones_turno')
      .select('id, fecha, personal_hotel!inner(hotel_id)')
      .eq('personal_hotel.hotel_id', hotelId)
      .gte('fecha', sumarDiasYMD(desde, -1))
      .lte('fecha', hasta);
    if (sesError) throw sesError;

    const sesionIds = (sesiones ?? []).map((s) => s.id);

    let movimientos: MovimientoCaja[] = [];
    if (sesionIds.length > 0) {
      const { data, error: movError } = await client
        .from('movimientos_caja')
        .select('id, sesion_turno_id, tipo, monto, concepto, metodo_pago, notas, created_at')
        .eq('tipo', 'ingreso')
        .in('sesion_turno_id', sesionIds)
        .gte('created_at', desdeInstante.toISOString())
        .lt('created_at', hastaInstanteExclusivo.toISOString());
      if (movError) throw movError;
      movimientos = data ?? [];
    }

    const indiceDia = new Map(dias.map((d, i) => [d, i]));

    function construirFilas(claves: string[], obtenerClave: (m: MovimientoCaja) => string) {
      const porClave = new Map<string, number[]>();
      for (const clave of claves) porClave.set(clave, new Array(dias.length).fill(0));

      for (const m of movimientos) {
        const clave = obtenerClave(m);
        if (!porClave.has(clave)) continue; // no debería pasar (claves ya cubren todo), por si acaso
        const idxDia = indiceDia.get(fechaLimaYMD(m.created_at));
        if (idxDia === undefined) continue; // movimiento de una sesión ensanchada, fuera del rango real
        porClave.get(clave)![idxDia] += Number(m.monto);
      }

      const filas = claves.map((clave) => {
        const valores = porClave.get(clave)!;
        return { etiqueta: clave, valores, total: valores.reduce((a, b) => a + b, 0) };
      });
      const totalesPorDia = dias.map((_, i) => filas.reduce((acc, f) => acc + f.valores[i], 0));
      const total = totalesPorDia.reduce((a, b) => a + b, 0);
      return { filas, totalesPorDia, total };
    }

    const porMetodo = construirFilas(METODOS_PAGO, (m) => m.metodo_pago);
    const porTipo = construirFilas(TIPOS_INGRESO_ORDEN, (m) => categoriaTipoIngreso(m.concepto));

    return {
      dias,
      porMetodo: porMetodo.filas,
      totalesPorDiaMetodo: porMetodo.totalesPorDia,
      totalMetodo: porMetodo.total,
      porTipo: porTipo.filas,
      totalesPorDiaTipo: porTipo.totalesPorDia,
      totalTipo: porTipo.total,
    };
  }

  /**
   * Solo admin: ocupabilidad del hotel entero en un rango de fechas --
   * ingresos totales generados por las estadías cuyo check-in real cayó en
   * ese rango, divididos entre la suma de días hospedados de esas mismas
   * estadías (reserva_habitacion.dias, que se mantiene al día con
   * extensiones -- ver EstadiasService). Se toma el check-in como fecha
   * base (no el checkout ni la fecha del movimiento) porque así lo pidió
   * el negocio: una estadía cuenta para el mes en que empezó, aunque sus
   * cargos se sigan generando o pagando después.
   */
  async reporteOcupabilidad(client: SupabaseClient, hotelId: string, desde: string, hasta: string) {
    if (hasta < desde) {
      throw new BadRequestException('La fecha "hasta" no puede ser anterior a "desde".');
    }

    const desdeInstante = fechaLimaAInstante(desde);
    const hastaInstanteExclusivo = new Date(fechaLimaAInstante(hasta).getTime() + 24 * 60 * 60 * 1000);

    const { data: lineas, error } = await client
      .from('reserva_habitacion')
      .select(
        `
        id, dias,
        reservas!inner(hotel_id),
        estadias!inner(id, checkin_real)
      `,
      )
      .eq('reservas.hotel_id', hotelId)
      .gte('estadias.checkin_real', desdeInstante.toISOString())
      .lt('estadias.checkin_real', hastaInstanteExclusivo.toISOString());
    if (error) throw error;

    const filas = lineas ?? [];
    const diasOcupados = filas.reduce((acc, l) => acc + Number(l.dias), 0);
    const estadiaIds = filas.map((l) => (l as any).estadias.id);

    let ingresosTotales = 0;
    if (estadiaIds.length > 0) {
      const { data: movimientos, error: movError } = await client
        .from('movimientos_cuenta')
        .select('monto')
        .neq('tipo', 'pago')
        .in('estadia_id', estadiaIds);
      if (movError) throw movError;
      ingresosTotales = movimientos?.reduce((acc, m) => acc + Number(m.monto), 0) ?? 0;
    }

    return {
      desde,
      hasta,
      ingresosTotales,
      diasOcupados,
      ocupabilidad: diasOcupados > 0 ? ingresosTotales / diasOcupados : 0,
    };
  }

  private sumar(movimientos: { monto: number }[]) {
    return movimientos.reduce((acc, m) => acc + Number(m.monto), 0);
  }

  private agruparPorConcepto(movimientos: MovimientoCaja[]) {
    const mapa = new Map<string, number>();
    for (const m of movimientos) {
      const etiqueta = this.etiquetaConcepto(m);
      mapa.set(etiqueta, (mapa.get(etiqueta) ?? 0) + Number(m.monto));
    }
    return [...mapa.entries()]
      .map(([concepto, monto]) => ({ concepto, monto }))
      .sort((a, b) => b.monto - a.monto);
  }

  private etiquetaConcepto(m: MovimientoCaja): string {
    if (m.concepto === 'Pago de huésped' && m.notas?.trim()) {
      return m.notas.trim();
    }
    return CONCEPTO_LABEL[m.concepto] ?? m.concepto;
  }
}
