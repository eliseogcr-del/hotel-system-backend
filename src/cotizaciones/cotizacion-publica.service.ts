import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../common/supabase/supabase.service';
import { DisponibilidadService } from '../habitaciones/disponibilidad/disponibilidad.service';
import { HuespedesService } from '../huespedes/huespedes.service';
import { ReservasService } from '../reservas/reservas.service';
import { CrearReservaDto } from '../reservas/dto/crear-reserva.dto';
import { CrearReservaHabitacionDto } from '../reservas/dto/crear-reserva-habitacion.dto';
import { CotizacionesService } from './cotizaciones.service';
import { CrearCotizacionWhatsappDto } from './dto/crear-cotizacion-whatsapp.dto';
import { CrearCotizacionDto } from './dto/crear-cotizacion.dto';
import { HabitacionesDisponiblesWhatsappDto } from './dto/habitaciones-disponibles-whatsapp.dto';
import { CrearReservaWhatsappDto } from './dto/crear-reserva-whatsapp.dto';

function sumarDiasYMD(fechaYMD: string, dias: number): string {
  const [anio, mes, dia] = fechaYMD.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function calcularDias(fechaDesde: string, fechaHasta: string): number {
  return Math.max(
    1,
    Math.ceil((new Date(fechaHasta).getTime() - new Date(fechaDesde).getTime()) / (1000 * 60 * 60 * 24)),
  );
}

// Postgres devuelve una columna `time` como "HH:MM:SS" (ver mismo patrón en
// EstadiasService/ReservasService: hotel.hora_checkout.split(':')) -- se
// recorta a "HH:MM" para poder compararla/concatenarla con las horas del
// formulario, que sí vienen en ese formato.
function aHoraHHMM(hora: string): string {
  return hora.slice(0, 5);
}

/**
 * Punto de entrada del agente de WhatsApp (fase 1: sin envío/recepción de
 * mensajes todavía, ver CLAUDE.md -- eso depende de la verificación del
 * negocio en Meta Business). Lo llama el formulario público que el bot le
 * manda al cliente por chat, sin login: usa el cliente de servicio (salta
 * RLS) igual que el resto de procesos sin un usuario humano logueado (ver
 * SupabaseService.getServiceClient()).
 *
 * Grupos de hasta `umbral_grupo_grande` personas se autocotizan con la
 * tarifa normal de una sola habitación (la más barata que alcance) x
 * noches, y quedan 'aprobada' de una. Grupos más grandes reparten personas
 * entre varias habitaciones sin definir precio todavía y quedan
 * 'pendiente_revision' -- el staff completa la tarifa por línea (ya
 * editable desde antes) y recién ahí las aprueba.
 */
@Injectable()
export class CotizacionPublicaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly disponibilidad: DisponibilidadService,
    private readonly cotizacionesService: CotizacionesService,
    private readonly huespedesService: HuespedesService,
    private readonly reservasService: ReservasService,
  ) {}

  // Fechas/horas de check-in/checkout + días + late derivan igual en los
  // tres flujos públicos (cotizar directo/grupo, listar habitaciones,
  // reservar) -- centralizado acá para no repetir la cuenta tres veces.
  private resolverFechas(
    dto: { fechaIngreso: string; horaIngreso: string; noches: number; fechaSalida?: string; horaSalida?: string },
    hotel: { hora_checkout: string },
  ) {
    const horaCheckoutHotel = hotel.hora_checkout ? aHoraHHMM(hotel.hora_checkout) : '12:00';
    const horaCheckout = dto.horaSalida ?? horaCheckoutHotel;
    const fechaHasta = dto.fechaSalida ?? sumarDiasYMD(dto.fechaIngreso, dto.noches);
    const checkinISO = `${dto.fechaIngreso}T${dto.horaIngreso}:00`;
    const checkoutISO = `${fechaHasta}T${horaCheckout}:00`;

    if (new Date(checkoutISO) <= new Date(checkinISO)) {
      throw new BadRequestException('La fecha/hora de salida debe ser posterior a la de ingreso.');
    }
    const dias = calcularDias(dto.fechaIngreso, fechaHasta);
    // El cliente pidió una hora de salida más tarde que el checkout estándar
    // del hotel -- 50% de la tarifa de esa noche (ver charla con el cliente).
    const esLate = horaCheckout > horaCheckoutHotel;
    return { fechaHasta, horaCheckout, checkinISO, checkoutISO, dias, esLate };
  }

  // Tipos pensados para 2 (ej. matrimonial) tienen una tarifa más baja
  // cuando la reserva completa es de 1 sola persona -- ver
  // ConfiguracionService/ReservasService.tarifaSegunTipoCliente
  // (precio_individual). Solo aplica cuando TODA la reserva pública es de 1
  // persona: el reparto entre varias habitaciones de un grupo no se
  // considera "individual" aunque a alguna le toque 1 nada más.
  private precioNocheEfectivo(
    tipo: { precio_normal: number; precio_individual: number | null } | null,
    personasTotales: number,
  ): number {
    if (personasTotales === 1 && tipo?.precio_individual != null) {
      return Number(tipo.precio_individual);
    }
    return Number(tipo?.precio_normal ?? 0);
  }

  async crearDesdeWhatsapp(hotelId: string, dto: CrearCotizacionWhatsappDto) {
    const client = this.supabase.getServiceClient();
    const hotel = await this.cargarHotelConBotActivo(client, hotelId);

    const { fechaHasta, horaCheckout, checkinISO, checkoutISO, dias, esLate } = this.resolverFechas(dto, hotel);

    const huesped = await this.buscarOCrearHuesped(client, hotelId, dto);

    const base = { hotelId, dto, huesped, fechaHasta, horaCheckout, checkinISO, checkoutISO, dias, esLate, hotel };
    return dto.personas <= hotel.umbral_grupo_grande
      ? this.cotizarDirecto(client, base)
      : this.cotizarGrupo(client, base);
  }

  // Para que el formulario público muestre la hora de check-in/checkout
  // configurada del hotel como valor por defecto, y avise de una vez si el
  // agente no está activo (sin esperar a que el cliente llene todo el
  // formulario para recién enterarse).
  async obtenerInfoPublica(hotelId: string) {
    const client = this.supabase.getServiceClient();
    const { data, error } = await client
      .from('hoteles')
      .select('nombre, activo, agente_whatsapp_activo, hora_checkin, hora_checkout, umbral_grupo_grande')
      .eq('id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new ForbiddenException('El agente de WhatsApp no está disponible para este hotel en este momento.');
    }
    return {
      nombre: data.nombre,
      agenteActivo: !!(data.activo && data.agente_whatsapp_activo),
      horaCheckin: aHoraHHMM(data.hora_checkin),
      horaCheckout: aHoraHHMM(data.hora_checkout),
      // El formulario lo usa para decidir si, al llenar fechas + personas,
      // muestra la lista de habitaciones reales con reserva directa (grupos
      // chicos) o el flujo de cotización con revisión humana (grupos
      // grandes) -- ver CotizacionesModule.cotizarDirecto/cotizarGrupo.
      umbralGrupoGrande: data.umbral_grupo_grande,
    };
  }

  /**
   * Lista de habitaciones REALES disponibles para el rango pedido, para que
   * el cliente elija con checkboxes cuáles reservar (ver CLAUDE.md, agente
   * de WhatsApp: "Vamos a hacer un cambio en este formulario..."). Solo
   * aplica al camino de grupos chicos -- grupos por encima del umbral
   * siguen yendo por cotizarGrupo() con revisión humana, ver
   * crearReservaDesdeWhatsapp().
   */
  async buscarHabitacionesDisponibles(hotelId: string, dto: HabitacionesDisponiblesWhatsappDto) {
    const client = this.supabase.getServiceClient();
    const hotel = await this.cargarHotelConBotActivo(client, hotelId);
    const { dias, esLate } = this.resolverFechas(dto, hotel);

    const habitaciones = await this.habitacionesDisponiblesReales(client, hotelId, dto, hotel);
    return {
      dias,
      esLate,
      habitaciones: habitaciones.map((h) => {
        const precioNoche = this.precioNocheEfectivo(h.tipos_habitacion, dto.personas);
        return {
          habitacionId: h.id,
          numero: h.hab_numero,
          tipo: h.tipos_habitacion?.nombre ?? '—',
          aforoMax: h.tipos_habitacion?.aforo_max ?? 0,
          precioNoche,
          importe: Math.round(precioNoche * dias * 100) / 100,
        };
      }),
    };
  }

  // Compartido por buscarHabitacionesDisponibles() (para mostrar la lista) y
  // crearReservaDesdeWhatsapp() (para recalcular del lado del servidor lo
  // que el cliente marcó, sin confiar en precio/aforo que pudiera mandar de
  // vuelta -- ver CrearReservaWhatsappDto).
  private async habitacionesDisponiblesReales(
    client: SupabaseClient,
    hotelId: string,
    dto: { fechaIngreso: string; horaIngreso: string; noches: number; fechaSalida?: string; horaSalida?: string },
    hotel: { hora_checkout: string },
  ) {
    const { checkinISO, checkoutISO } = this.resolverFechas(dto, hotel);

    const { data: candidatas, error } = await client
      .from('habitaciones')
      .select('id, hab_numero, tipos_habitacion(nombre, aforo_max, precio_normal, precio_individual)')
      .eq('hotel_id', hotelId)
      .eq('visible_whatsapp', true)
      .neq('estado', 'bloqueada');
    if (error) throw error;

    const disponibles: any[] = [];
    for (const candidata of (candidatas ?? []) as any[]) {
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: candidata.id,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
      });
      if (resultado.disponible) disponibles.push(candidata);
    }

    return disponibles.sort((a, b) => a.hab_numero - b.hab_numero);
  }

  /**
   * Botón "Reservar" del formulario público: crea una reserva real (no una
   * cotización) con origen='whatsapp' para que el calendario la pinte
   * distinto (ver CLAUDE.md, agente de WhatsApp). El precio y aforo de cada
   * habitación se vuelven a leer de la base acá mismo -- nunca se confía en
   * lo que el cliente vio/marcó en el navegador.
   */
  async crearReservaDesdeWhatsapp(hotelId: string, dto: CrearReservaWhatsappDto) {
    const client = this.supabase.getServiceClient();
    const hotel = await this.cargarHotelConBotActivo(client, hotelId);

    if (dto.personas > hotel.umbral_grupo_grande) {
      throw new BadRequestException(
        'Para grupos de este tamaño el hotel confirma el precio manualmente por WhatsApp.',
      );
    }

    const { checkinISO, checkoutISO, esLate } = this.resolverFechas(dto, hotel);
    const huesped = await this.buscarOCrearHuesped(client, hotelId, dto);

    const candidatas = await this.habitacionesDisponiblesReales(client, hotelId, dto, hotel);
    const elegidas = candidatas.filter((h) => dto.habitacionIds.includes(h.id));
    if (elegidas.length !== dto.habitacionIds.length) {
      throw new BadRequestException(
        'Una o más habitaciones seleccionadas ya no están disponibles. Por favor vuelve a intentarlo.',
      );
    }

    // Habitaciones más grandes primero, mismo criterio de reparto que
    // cotizarGrupo(): cubre la cantidad de personas usando la menor
    // cantidad de habitaciones posible.
    const ordenadas = [...elegidas].sort(
      (a, b) => (b.tipos_habitacion?.aforo_max ?? 0) - (a.tipos_habitacion?.aforo_max ?? 0),
    );

    let restantes = dto.personas;
    const asignaciones: { habitacionId: string; nroPersonas: number; precioNoche: number }[] = [];
    for (const h of ordenadas) {
      if (restantes <= 0) break;
      const aforo = h.tipos_habitacion?.aforo_max ?? 0;
      if (aforo <= 0) continue;
      const asignadas = Math.min(restantes, aforo);
      asignaciones.push({
        habitacionId: h.id,
        nroPersonas: asignadas,
        precioNoche: this.precioNocheEfectivo(h.tipos_habitacion, dto.personas),
      });
      restantes -= asignadas;
    }

    if (restantes > 0) {
      throw new BadRequestException(
        'Las habitaciones seleccionadas no alcanzan para la cantidad de personas indicada.',
      );
    }

    // El cargo de late (si aplica) es único por toda la estadía, no por
    // habitación -- se anota en la primera línea, mismo criterio que el
    // cargo de mascota debajo.
    const cargoLate = esLate ? Math.round(asignaciones[0].precioNoche * 0.5 * 100) / 100 : 0;
    const cocheraId = dto.vehiculo
      ? await this.buscarCocheraIdDisponible(client, hotelId, dto.tipoVehiculo)
      : null;

    const habitacionesDto: CrearReservaHabitacionDto[] = asignaciones.map((a, i) => ({
      habitacionId: a.habitacionId,
      nroPersonas: a.nroPersonas,
      tipoAlquiler: 'pernocte',
      checkinPrevisto: checkinISO,
      checkoutPrevisto: checkoutISO,
      // Mascota/late/cochera son cargos únicos de la estadía completa (ver
      // CLAUDE.md 3.3/3.1) -- se cargan solo en la primera línea para no
      // duplicarlos cuando la reserva ocupa varias habitaciones.
      conMascota: i === 0 ? dto.mascota : false,
      cobroLate: i === 0 ? cargoLate : 0,
      cocheraId: i === 0 && cocheraId ? cocheraId : undefined,
      vehiculoTipo: i === 0 && dto.vehiculo ? dto.tipoVehiculo : undefined,
      observaciones:
        i === 0 && dto.vehiculo && !cocheraId
          ? 'Reserva creada por el agente de WhatsApp: cliente indicó vehículo, sin cochera disponible al momento de reservar.'
          : undefined,
    }));

    const reservaDto: CrearReservaDto = {
      huespedId: huesped.id,
      origen: 'whatsapp',
      moneda: 'PEN',
      facturable: dto.facturable,
      habitaciones: habitacionesDto,
    };

    return this.reservasService.crear(client, hotelId, reservaDto, null, { creadoPorAgente: true });
  }

  private async buscarCocheraIdDisponible(
    client: SupabaseClient,
    hotelId: string,
    tipoVehiculo?: string,
  ): Promise<string | null> {
    const tamano = tipoVehiculo === 'camioneta' ? 'grande' : 'chica';
    const { data, error } = await client
      .from('cocheras')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('tamano', tamano)
      .eq('estado', 'disponible')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  private async cargarHotelConBotActivo(client: SupabaseClient, hotelId: string) {
    const { data, error } = await client
      .from('hoteles')
      .select('id, activo, agente_whatsapp_activo, umbral_grupo_grande, hora_checkout, precio_mascota')
      .eq('id', hotelId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.activo || !data.agente_whatsapp_activo) {
      throw new ForbiddenException('El agente de WhatsApp no está disponible para este hotel en este momento.');
    }
    return data;
  }

  private async buscarOCrearHuesped(client: SupabaseClient, hotelId: string, dto: CrearCotizacionWhatsappDto) {
    const existente = await this.huespedesService.buscarPorDocumento(client, hotelId, dto.tipoDoc, dto.nroDoc);
    if (existente) return existente;
    return this.huespedesService.crear(client, hotelId, {
      tipoDoc: dto.tipoDoc,
      nroDoc: dto.nroDoc,
      nombres: dto.nombres,
      apellidos: dto.apellidos,
      telefono: dto.telefono,
      ruc: dto.facturable ? dto.ruc : undefined,
      razonSocial: dto.facturable ? dto.razonSocial : undefined,
    });
  }

  private async buscarCocheraDisponibleAhora(client: SupabaseClient, hotelId: string, tipoVehiculo?: string) {
    // El hotel solo tiene 2 tamaños de cochera (grande para camioneta, chica
    // para el resto) -- ver CLAUDE.md sección 3.1.
    const tamano = tipoVehiculo === 'camioneta' ? 'grande' : 'chica';
    const { data, error } = await client
      .from('cocheras')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('tamano', tamano)
      .eq('estado', 'disponible')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  private notasExtra(dto: CrearCotizacionWhatsappDto, hotel: { precio_mascota: number }): string[] {
    const notas: string[] = [];
    if (dto.mascota && Number(hotel.precio_mascota) > 0) {
      notas.push(
        `Viaja con mascota: se aplicará un cargo adicional de S/. ${Number(hotel.precio_mascota).toFixed(2)}/día al check-in (no incluido en este total).`,
      );
    }
    return notas;
  }

  private async cotizarDirecto(
    client: SupabaseClient,
    ctx: {
      hotelId: string;
      dto: CrearCotizacionWhatsappDto;
      huesped: { id: string };
      fechaHasta: string;
      horaCheckout: string;
      checkinISO: string;
      checkoutISO: string;
      dias: number;
      esLate: boolean;
      hotel: { precio_mascota: number };
    },
  ) {
    const { hotelId, dto, huesped, fechaHasta, horaCheckout, checkinISO, checkoutISO, dias, esLate, hotel } = ctx;

    const { data: candidatas, error } = await client
      .from('habitaciones')
      .select('id, tipos_habitacion(nombre, aforo_max, precio_normal)')
      .eq('hotel_id', hotelId)
      .eq('visible_whatsapp', true)
      .neq('estado', 'bloqueada');
    if (error) throw error;

    // Ordenar por precio_normal es sobre un embed "a uno" (tipos_habitacion
    // desde habitaciones) -- PostgREST no lo soporta (mismo caso ya resuelto
    // en CotizacionesService.obtenerDetalle()), así que se ordena en memoria.
    const aptas = (candidatas ?? [])
      .filter((h: any) => (h.tipos_habitacion?.aforo_max ?? 0) >= dto.personas)
      .sort((a: any, b: any) => Number(a.tipos_habitacion.precio_normal) - Number(b.tipos_habitacion.precio_normal));

    let elegida: any = null;
    for (const candidata of aptas) {
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: candidata.id,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
      });
      if (resultado.disponible) {
        elegida = candidata;
        break;
      }
    }

    if (!elegida) {
      return {
        modo: 'directo' as const,
        disponible: false,
        mensaje: 'No hay habitaciones disponibles para esas fechas y cantidad de personas. Por favor comunícate directamente con el hotel.',
      };
    }

    const precioNormal = Number(elegida.tipos_habitacion.precio_normal);
    const cargoLate = esLate ? Math.round(precioNormal * 0.5 * 100) / 100 : 0;
    const totalHabitacion = precioNormal * dias + cargoLate;
    // El sistema cotiza por precio-por-persona-por-noche (ver CLAUDE.md 3.3),
    // no por habitación plana -- se deriva un precio por persona que, al
    // multiplicarlo de vuelta (personas x precio x noches), reproduce el
    // total real de la tarifa normal de la habitación (± centavos de
    // redondeo). Queda explicado en la nota para que quede claro en el PDF
    // que es una tarifa de habitación completa, no literal "por persona".
    const precioPersona = Math.round((totalHabitacion / (dto.personas * dias)) * 100) / 100;

    const notas = [
      `Cotización generada por WhatsApp. Tarifa normal de la habitación: S/. ${precioNormal.toFixed(2)}/noche (habitación completa, no por persona).`,
      ...(esLate ? [`Incluye cargo por salida tardía (50% de 1 noche): S/. ${cargoLate.toFixed(2)}.`] : []),
      ...this.notasExtra(dto, hotel),
      ...(dto.vehiculo
        ? [
            (await this.buscarCocheraDisponibleAhora(client, hotelId, dto.tipoVehiculo))
              ? 'Cochera disponible al momento de la consulta (se confirma al llegar).'
              : 'Sin cochera disponible al momento de la consulta; se confirmará al llegar.',
          ]
        : []),
    ].join(' ');

    const cotizacionDto: CrearCotizacionDto = {
      huespedId: huesped.id,
      fechaDesde: dto.fechaIngreso,
      fechaHasta,
      horaCheckin: dto.horaIngreso,
      horaCheckout,
      moneda: 'PEN',
      habitaciones: [
        {
          habitacionId: elegida.id,
          nroPersonas: dto.personas,
          precioPersona,
          notas,
          forzarNoDisponible: false,
        },
      ],
    };

    const cotizacion = await this.cotizacionesService.crear(client, hotelId, cotizacionDto, null, {
      estado: 'aprobada',
      origen: 'whatsapp',
    });
    return { modo: 'directo' as const, disponible: true, cotizacion };
  }

  private async cotizarGrupo(
    client: SupabaseClient,
    ctx: {
      hotelId: string;
      dto: CrearCotizacionWhatsappDto;
      huesped: { id: string };
      fechaHasta: string;
      horaCheckout: string;
      checkinISO: string;
      checkoutISO: string;
      hotel: { precio_mascota: number };
    },
  ) {
    const { hotelId, dto, huesped, fechaHasta, horaCheckout, checkinISO, checkoutISO, hotel } = ctx;

    const { data: candidatas, error } = await client
      .from('habitaciones')
      .select('id, tipos_habitacion(aforo_max)')
      .eq('hotel_id', hotelId)
      .eq('visible_whatsapp', true)
      .neq('estado', 'bloqueada');
    if (error) throw error;

    // Habitaciones más grandes primero, para usar la menor cantidad posible.
    const ordenadas = ((candidatas ?? []) as any[]).sort(
      (a: any, b: any) => (b.tipos_habitacion?.aforo_max ?? 0) - (a.tipos_habitacion?.aforo_max ?? 0),
    );

    const asignaciones: { habitacionId: string; nroPersonas: number }[] = [];
    let restantes = dto.personas;
    for (const candidata of ordenadas) {
      if (restantes <= 0) break;
      const aforo = candidata.tipos_habitacion?.aforo_max ?? 0;
      if (aforo <= 0) continue;
      const resultado = await this.disponibilidad.validar(client, {
        hotelId,
        habitacionId: candidata.id,
        checkinPrevisto: checkinISO,
        checkoutPrevisto: checkoutISO,
      });
      if (!resultado.disponible) continue;
      const asignadas = Math.min(restantes, aforo);
      asignaciones.push({ habitacionId: candidata.id, nroPersonas: asignadas });
      restantes -= asignadas;
    }

    if (restantes > 0) {
      return {
        modo: 'grupo' as const,
        disponible: false,
        mensaje: 'No hay suficiente disponibilidad para todo el grupo en esas fechas. Por favor comunícate directamente con el hotel.',
      };
    }

    const notaComun =
      'Cotización de grupo generada por WhatsApp — pendiente de que el hotel defina la tarifa por persona.';
    const notasExtra = this.notasExtra(dto, hotel);

    const cotizacionDto: CrearCotizacionDto = {
      huespedId: huesped.id,
      fechaDesde: dto.fechaIngreso,
      fechaHasta,
      horaCheckin: dto.horaIngreso,
      horaCheckout,
      moneda: 'PEN',
      habitaciones: asignaciones.map((a) => ({
        habitacionId: a.habitacionId,
        nroPersonas: a.nroPersonas,
        precioPersona: 0,
        notas: [notaComun, ...notasExtra].join(' '),
        forzarNoDisponible: false,
      })),
    };

    const cotizacion = await this.cotizacionesService.crear(client, hotelId, cotizacionDto, null, {
      estado: 'pendiente_revision',
      origen: 'whatsapp',
    });
    return { modo: 'grupo' as const, disponible: true, cotizacion };
  }
}
