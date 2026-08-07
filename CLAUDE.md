# Sistema de Gestión Hotelera Multi-Tenant — Contexto del proyecto

Este documento resume las decisiones de negocio y arquitectura ya cerradas
con el cliente. Léelo antes de tocar código: evita repetir análisis ya
hecho y evita romper reglas de negocio que no son obvias mirando solo el
schema.

## 1. Contexto del negocio

El desarrollador da servicio de sistema a hoteles. Cliente inicial: **Hotel
Jorge Chávez**, 25 habitaciones, 6 pisos, 2 cocheras (una grande para
camioneta, una chica para auto). Hoy operan con un Google Sheet
(`CONTROL_HABITACIONES_JORGE_CHAVEZ`) que se está quedando corto.

**El sistema es multi-tenant desde el diseño**, no un sistema para un solo
hotel: proyección de 2 hoteles en el corto plazo, 3 en el mediano, hasta 10
en el largo plazo. El personal (recepcionista, HK) puede trabajar en más
de un hotel de la misma cadena, cada uno con su propio rol por hotel.

## 2. Stack técnico decidido

- **Base de datos**: Supabase (Postgres + Auth + Row Level Security)
- **Backend**: NestJS + TypeScript (elegido sobre Express/Fastify por la
  cantidad de módulos con reglas de acceso distintas — Guards de NestJS
  encajan naturalmente con roles por hotel)
- **Multi-tenancy**: schema único, aislamiento por `hotel_id` + RLS (no
  schema-per-tenant)

## 3. Modelo de datos — 26 entidades, 7 módulos

El schema completo vive en `sql/schema.sql`. Resumen de las decisiones no
obvias detrás de cada módulo:

### 3.1 Núcleo (hoteles, habitaciones, reservas)
- `hoteles` es el tenant raíz. Todo cuelga de `hotel_id`.
- **`reservas` vs `estadias` están separadas a propósito.** El Sheet
  actual mezcla "la intención de reservar" con "lo que pasa hoy en la
  habitación". `reservas` + `reserva_habitacion` es la planificación
  (puede ser a futuro, por varias habitaciones a la vez — reservas
  grupales). `estadias` es la ocupación real, 1:1 con cada línea de
  `reserva_habitacion`.
- **Una reserva puede incluir varias habitaciones** (`reserva_habitacion`
  es 1:N respecto a `reservas`). Cada línea tiene su propia tarifa,
  cantidad de personas, y puede llevar cargo extra por exceso de aforo
  (ej. una cuádruple con 4 personas permitidas donde ingresan 5 — el
  huésped extra NO se registra con nombre/DNI, solo se anota en
  `observaciones` y se cobra el adicional).
- `tipo_alquiler` distingue `pernocte` de `por_horas` — importante para el
  motor de disponibilidad (ver sección 4).
- `tipos_habitacion` es un **catálogo libre por hotel**: cada hotel arma
  sus propios tipos (uno puede no tener "séxtuple", otro puede inventar
  "suite"). No hay una lista global fija.
- `cocheras` es una entidad aparte de `habitaciones` (no un tipo de
  habitación). Solo 2 estados: `ocupada` / `disponible`. Soporta cochera
  externa con precio (`es_externa`, `precio_externa`) para cuando el
  hotel no tiene espacio propio.

### 3.2 Operación diaria (`tareas_hk`)
- El mantenimiento y la limpieza NO son un campo fijo en la habitación —
  son una **cola de tareas priorizable** que el HK atiende desde su
  celular (inicia y termina cada tarea él mismo).
- `con_huesped_dentro`: el mantenimiento puede planificarse **mientras el
  huésped sigue hospedado** (le preguntan si autoriza el ingreso). En ese
  caso el color de la habitación **sigue en rojo (ocupada)** hasta que el
  HK activa el inicio de la tarea — ahí recién pasa a naranja. Hay que
  distinguir esto del mantenimiento post-checkout.
- La limpieza profunda (color amarillo) solo aplica **después de un
  checkout**. El HK (o el recepcionista) la pasa a verde al terminar.
- Tiempo de limpieza estimado es **por tipo de habitación**
  (`tipos_habitacion.tiempo_limpieza_min`): ~40min una matrimonial, ~2h
  una cuádruple. Este valor alimenta el motor de disponibilidad.

### 3.3 Financiero
- **`movimientos_cuenta` es un libro único de cargos y abonos por
  estadía** (reemplaza lo que serían tablas separadas de "pagos" y
  "consumos"). Esto refleja cómo el hotel ya trabaja en su hoja
  `CuentasCobrar`: todo es un solo ledger con un campo `tipo`
  (`alquiler`, `consumo_bazar`, `pago`, `early`, `late`, `ajuste`,
  `cochera`). El saldo de una estadía = suma de cargos − suma de abonos.
- Los consumos del bazar (gaseosa, agua, galletas) a veces se pagan al
  momento (`pagado_al_momento = true`, generan también un
  `movimientos_caja` de ingreso) y a veces se acumulan a la cuenta para
  cobrar después.
- **Tarifas están vinculadas al tipo de habitación**, no a la habitación
  individual (esto se corrigió tras una confusión inicial con los datos
  reales del Excel). Columnas: `minimo`, `normal`, `booking`, `airbnb`.
- **Dos mecanismos de descuento, no excluyentes**:
  1. `reserva_habitacion.tarifa_dia` es editable — se puede cobrar más o
     menos por noche que la tarifa sugerida del tipo.
  2. `reservas.descuento_total` es un monto fijo que se resta al final,
     después de sumar todas las noches de todas las habitaciones.
- `tarifas_especiales` guarda tarifa negociada + comisión (%) por
  empresa convenio (dato real que viene de la hoja `EMPRESAS %`).
- `comprobantes` es informativo por ahora — el hotel emite boleta/factura
  manual en SUNAT, no hay integración directa con Nubefac aún, pero el
  campo está listo para agregarla sin rediseñar.

### 3.4 Personal y caja — la parte más delicada
- **Cada recepcionista es responsable exclusivo de su propia caja.** No
  ve movimientos de otros recepcionistas. Solo el admin del hotel ve el
  consolidado de todos, por turno.
- `sesiones_turno` hereda el saldo de la sesión anterior
  (`sesion_anterior_id`) — el cierre de un turno (liquidación) se
  convierte en el saldo inicial del siguiente.
- Turnos de recepción tienen **horario fijo**: Mañana 7am–3pm, Tarde
  3pm–9pm, Noche 9pm–7am del día siguiente. El HK tiene horario variable
  (completa 8 horas dentro del día).
- **`personal` puede trabajar en varios hoteles** — por eso existe
  `personal_hotel` como tabla puente, con el rol pudiendo ser distinto en
  cada hotel. `es_super_admin` es un flag aparte en `personal`, no un rol
  de `personal_hotel`: el súper admin no está "asignado" a un hotel en
  particular, ve el consolidado de todos.
- Roles válidos hoy: `admin`, `recepcion`, `hk`. No hay rol de gerente
  separado del admin (decisión explícita del cliente).

### 3.5 Cotizaciones
- Pensado para clientes que reservan muchas habitaciones a futuro (grupos,
  iglesias, empresas) y piden cotización antes de reservar.
- El motor de disponibilidad se usa también aquí, para no ofrecer en la
  cotización habitaciones que ya están comprometidas.
- **Al convertir cotización → reserva, los datos se COPIAN** (no se
  enlazan) a nuevas filas de `reserva_habitacion`. La reserva resultante
  debe poder editarse libremente después (cambiar de habitación si se
  liberó una por cancelación, ajustar fechas, etc.) sin afectar el
  documento histórico de la cotización.

### 3.6 Integración Booking / Airbnb — Opción B (decisión explícita)
- Booking.com **no acepta conexión directa de propiedades individuales**
  a su API — solo a "Connectivity Partners" (channel managers). Ese
  camino se descartó por ahora.
- Se optó por la **Opción B**: leer los correos de confirmación que ya
  llegan de Booking/Airbnb, parsearlos (regex o LLM), y crear la reserva
  automáticamente con `estado = 'pendiente_revision'` para que el
  recepcionista la confirme con un clic en vez de tipearla entera.
- `importaciones_canal` guarda el correo crudo (`datos_crudos jsonb`) y el
  resultado del parseo — importante para poder diagnosticar cuando
  Booking/Airbnb cambien el formato del correo.
- Airbnb es bajo volumen pero se pidió explícitamente incluirlo con el
  mismo mecanismo.

## 4. El motor de disponibilidad (regla de negocio más crítica)

Ya implementado en `src/habitaciones/disponibilidad/disponibilidad.service.ts`.
No relajar estas reglas sin confirmar con el cliente:

- **Bloqueo DURO** (no debe dejar continuar al recepcionista), en dos
  casos:
  1. El rango solicitado se solapa con otra reserva activa de la misma
     habitación.
  2. El rango solicitado no deja el margen mínimo de limpieza
     (`tipos_habitacion.tiempo_limpieza_min`) antes o después de otra
     reserva activa de la misma habitación.
- El estado visual de la habitación (semáforo: disponible/ocupada/
  limpieza/mantenimiento) es independiente de este chequeo — una
  habitación puede estar "disponible" hoy y aun así estar bloqueada para
  alquilar si hay una reserva futura sin margen suficiente.
- Ejemplo real que motivó esta regla: alquilar hoy a las 5pm por horas,
  huésped sale a las 10pm, pero el HK recién entra a las 9am del día
  siguiente — ese alquiler debe bloquearse si dejaría la habitación sucia
  demasiado tiempo antes de la próxima entrada conocida.

## 5. Migración de datos (cuando el sistema esté listo)

El Excel actual (`CONTROL_HABITACIONES_JORGE_CHAVEZ`) tiene 14 hojas, pero
**solo 6 son fuente de verdad** a migrar:

| Hoja actual      | Entidad destino                          |
|------------------|-------------------------------------------|
| `Reservas`       | `reservas` + `reserva_habitacion`         |
| `Pagos`          | `movimientos_cuenta` (tipo = pago)        |
| `Gastos`         | `movimientos_caja`                        |
| `CuentasCobrar`  | `movimientos_cuenta` (tipo = cargo)       |
| `Usuarios`       | `personal` + `personal_hotel`             |
| `Tarifas`        | `tarifas` (a nivel de tipo de habitación) |

Las demás hojas (`Habitaciones` calendario, `Sesiones`, `FacturasBoletas`,
`EMPRESAS %`, `AIRBNB`, `Tarifasespeciales`, `PAGOSPENDIENTES`) NO se
migran — el sistema nuevo las genera solas.

**El estado actual de habitaciones (quién está hospedado AHORA MISMO) no
se puede migrar desde un archivo estático** porque cambia minuto a minuto.
La migración de ese estado se hace con un **corte en frío programado**: se
elige una fecha/hora de bajo movimiento (ej. turno noche), se toma el
snapshot justo en ese instante, y desde ahí el sistema nuevo es la única
fuente de verdad. Fecha de corte: **aún no definida**, se acuerda cuando
el sistema esté listo para producción.

## 6. Estado actual del código

- `sql/schema.sql` — schema completo, 25 tablas + RLS, ya escrito.
- `src/common/` — `SupabaseService`, `AuthGuard`, `RolesGuard`,
  decoradores `@Roles()` y `@CurrentUser()`. Completo y probado
  (compila sin errores).
- `src/habitaciones/` — dashboard de habitaciones + motor de
  disponibilidad. Completo.
- **Pendiente de construir**: `ReservasModule`, `EstadiasModule`
  (check-in/out + libro de movimientos_cuenta), `CajaModule`
  (apertura/cierre de turno, liquidación), `TareasHkModule` (cola de
  prioridad), `CotizacionesModule`, `ImportacionesCanalModule` (parser de
  correos).

## 7. Cómo trabajar en este proyecto

- Cada nuevo módulo sigue el mismo patrón que `habitaciones/`: controller
  con `@UseGuards(AuthGuard, RolesGuard)` + `@Roles(...)` por endpoint,
  servicio que recibe el `SupabaseClient` ya autenticado como parámetro
  (nunca crear un cliente nuevo dentro del servicio), y confiar en RLS
  como última línea de defensa — no asumir que el filtrado en el código
  de la app es suficiente.
- Antes de agregar un campo o tabla nueva, revisar si ya existe algo
  parecido en `sql/schema.sql` — el modelo pasó por varias rondas de
  validación contra datos reales del cliente y varios cambios de diseño
  quedaron documentados arriba (ej. tarifas por tipo no por habitación,
  movimientos_cuenta como libro único).
