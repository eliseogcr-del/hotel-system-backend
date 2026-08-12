-- ============================================================================
-- SISTEMA DE GESTIÓN HOTELERA MULTI-TENANT
-- Esquema para Supabase (PostgreSQL)
-- Cliente inicial: Hotel Jorge Chávez (25 habitaciones, 6 pisos, 2 cocheras)
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ============================================================================
-- MÓDULO 0: TENANT RAÍZ
-- ============================================================================

create table hoteles (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    ruc text,
    cantidad_pisos int not null default 1,
    moneda_default text not null default 'PEN' check (moneda_default in ('PEN','USD')),
    activo boolean not null default true,
    created_at timestamptz not null default now(),
    -- Cada hotel configura su propia hora de check-in/checkout (ej. Jorge
    -- Chávez: 13:00 / 12:00). modo_24h = true significa que no hay hora
    -- fija: el checkout previsto se calcula como checkin + dias, a la
    -- misma hora del checkin, sin comparar contra hora_checkin/checkout
    -- (esos dos campos se ignoran en ese modo).
    hora_checkin time not null default '13:00',
    hora_checkout time not null default '12:00',
    modo_24h boolean not null default false,
    -- Cobro por mascota, por día (igual criterio que la tarifa de
    -- habitación); 0 = sin cobro configurado todavía.
    precio_mascota numeric(10,2) not null default 0
);

-- ============================================================================
-- MÓDULO 1: PERSONAL, TURNOS, CAJA
-- ============================================================================

create table personal (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid references auth.users(id) on delete set null,
    nombre text not null,
    usuario text not null unique,
    es_super_admin boolean not null default false,
    activo boolean not null default true,
    created_at timestamptz not null default now()
);

create table personal_hotel (
    id uuid primary key default gen_random_uuid(),
    personal_id uuid not null references personal(id) on delete cascade,
    hotel_id uuid not null references hoteles(id) on delete cascade,
    rol text not null check (rol in ('admin','recepcion','hk')),
    activo boolean not null default true,
    unique (personal_id, hotel_id, rol)
);

create table turnos (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    nombre text not null,              -- 'Mañana','Tarde','Noche'
    hora_inicio time not null,
    hora_fin time not null,
    activo boolean not null default true
);

create table sesiones_turno (
    id uuid primary key default gen_random_uuid(),
    personal_hotel_id uuid not null references personal_hotel(id) on delete restrict,
    turno_id uuid not null references turnos(id) on delete restrict,
    sesion_anterior_id uuid references sesiones_turno(id),
    fecha date not null default current_date,
    saldo_inicial numeric(10,2) not null default 0,
    saldo_final numeric(10,2),
    estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
    abierta_en timestamptz not null default now(),
    cerrada_en timestamptz,
    cerrada_automaticamente boolean not null default false
);

create table movimientos_caja (
    id uuid primary key default gen_random_uuid(),
    sesion_turno_id uuid not null references sesiones_turno(id) on delete cascade,
    tipo text not null check (tipo in ('ingreso','egreso')),
    monto numeric(10,2) not null,
    concepto text not null,
    metodo_pago text not null default 'efectivo' check (metodo_pago in ('efectivo','transferencia','yape','tarjeta')),
    notas text,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- MÓDULO 2: HABITACIONES, TIPOS, COCHERAS, TARIFAS
-- ============================================================================

create table tipos_habitacion (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    nombre text not null,              -- Matrimonial, Doble, Doble Familiar, Triple...
    aforo_max int not null default 1,
    tiempo_limpieza_min int not null default 45,
    activo boolean not null default true,
    -- Precios por tipo de cliente (el recepcionista elige cuál aplica al
    -- momento de alquilar, ver CLAUDE.md: normal=cliente eventual,
    -- corporativo=empresa, web=reservas de canales online). Todos editables
    -- en el momento de la reserva, pero nunca por debajo de precio_costo.
    precio_normal numeric(10,2) not null default 0,
    precio_corporativo numeric(10,2) not null default 0,
    precio_web numeric(10,2) not null default 0,
    precio_por_hora numeric(10,2),     -- null = este tipo no admite alquiler por horas
    precio_costo numeric(10,2) not null default 0,  -- 0 = sin piso configurado todavía
    unique (hotel_id, nombre)
);

create table habitaciones (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    hab_numero int not null,
    tipo_id uuid not null references tipos_habitacion(id),
    piso int not null,
    estado text not null default 'disponible' check (estado in ('disponible','ocupada','limpieza','mantenimiento','bloqueada')),
    mantenimiento_planificado boolean not null default false,
    unique (hotel_id, hab_numero)
);

create table cocheras (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    numero text not null,
    tamano text not null check (tamano in ('grande','chica')),
    tipo_vehiculo_permitido text,      -- camioneta, auto, moto...
    estado text not null default 'disponible' check (estado in ('disponible','ocupada')),
    es_externa boolean not null default false,
    precio_externa numeric(10,2) default 0
);

create table tarifas (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    tipo_hab_id uuid not null references tipos_habitacion(id) on delete cascade,
    minimo numeric(10,2),
    normal numeric(10,2) not null,
    booking numeric(10,2),
    airbnb numeric(10,2),
    vigente_desde date not null default current_date
);

-- ============================================================================
-- MÓDULO 3: CLIENTES (huéspedes / empresas)
-- ============================================================================

create table huespedes (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    tipo_doc text not null check (tipo_doc in ('dni','pasaporte','carnet_extranjeria','cedula','otro')),
    nro_doc text not null,
    nombres text not null,
    apellidos text not null,
    nacionalidad text check (nacionalidad in ('peruano','extranjero')),
    origen text,               -- país de origen, solo tiene sentido si nacionalidad='extranjero'
    fecha_nacimiento date,
    telefono text,
    correo text,
    -- RUC/razón social para facturación: puede ser el del propio huésped
    -- (pidió factura a su nombre) o el de la empresa que paga su estadía
    -- (ej. una empresa hospeda a su personal) -- es un dato del huésped en
    -- sí, no una relación con la tabla `empresas` (que es para tarifas
    -- corporativas negociadas, un caso de uso distinto).
    ruc text,
    razon_social text,
    created_at timestamptz not null default now(),
    unique (hotel_id, tipo_doc, nro_doc)
);

create table empresas (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    ruc text not null,
    razon_social text not null,
    unique (hotel_id, ruc)
);

create table tarifas_especiales (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    empresa_id uuid not null references empresas(id) on delete cascade,
    tarifa_real numeric(10,2),
    tarifa_factura numeric(10,2),
    porcentaje numeric(5,2)
);

-- ============================================================================
-- MÓDULO 4: RESERVAS, ESTADÍAS, VEHÍCULOS, MANTENIMIENTO
-- ============================================================================

create table reservas (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    huesped_id uuid references huespedes(id),
    empresa_id uuid references empresas(id),
    origen text not null check (origen in ('telefono','whatsapp','booking','airbnb','directo','walkin')),
    codigo_externo text,                -- id de reserva en Booking/Airbnb
    fecha_ingreso timestamptz not null,
    dias_hospedaje int not null default 1,
    fecha_salida_prog date,
    moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
    deducible_impuestos boolean not null default true,
    descuento_total numeric(10,2) not null default 0,
    importe_final numeric(10,2),
    estado text not null default 'confirmada' check (estado in ('pendiente_revision','confirmada','cancelada')),
    creado_por uuid references personal(id),
    created_at timestamptz not null default now(),
    -- Anticipo (pago adelantado): el método lo decide quien reserva: solo
    -- si es 'efectivo' genera ingreso en la caja de la sesión de turno de
    -- quien lo registra (yape/tarjeta/transferencia van directo a la
    -- cuenta de la empresa). Se enlaza a la estadía real recién al hacer
    -- check-in, como un 'pago' que reduce el saldo -- ver
    -- EstadiasService.checkin().
    anticipo_monto numeric(10,2) not null default 0,
    anticipo_metodo_pago text check (anticipo_metodo_pago in ('efectivo','transferencia','yape','tarjeta')),
    anticipo_registrado_por uuid references personal(id),
    anticipo_sesion_turno_id uuid references sesiones_turno(id),
    anticipo_fecha timestamptz,
    anticipo_vinculado_estadia_id uuid references estadias(id)
);

create table reserva_habitacion (
    id uuid primary key default gen_random_uuid(),
    reserva_id uuid not null references reservas(id) on delete cascade,
    habitacion_id uuid not null references habitaciones(id),
    nro_personas int not null default 1,
    incluye_desayuno boolean not null default false,
    tarifa_dia numeric(10,2) not null,
    dias int not null default 1,
    cargo_aforo_extra numeric(10,2) not null default 0,
    cobro_early numeric(10,2) not null default 0,
    cobro_late numeric(10,2) not null default 0,
    -- Mascota: igual patrón que cobro_early/cobro_late -- se calcula al
    -- reservar (precio_mascota del hotel * dias) pero recién se postea
    -- como movimiento del libro de cuentas al hacer el check-in real.
    con_mascota boolean not null default false,
    cobro_mascota numeric(10,2) not null default 0,
    subtotal numeric(10,2) not null default 0,
    tipo_alquiler text not null default 'pernocte' check (tipo_alquiler in ('pernocte','por_horas')),
    fecha_hora_checkin_prevista timestamptz not null,
    fecha_hora_checkout_prevista timestamptz not null,
    observaciones text,
    cochera_id uuid references cocheras(id)
);

create table vehiculos (
    id uuid primary key default gen_random_uuid(),
    reserva_habitacion_id uuid not null unique references reserva_habitacion(id) on delete cascade,
    marca text,
    tipo text,                         -- auto, camioneta, moto... (mismo vocabulario que cocheras.tipo_vehiculo_permitido)
    placa text,
    color text,
    caracteristicas text
);

create table estadias (
    id uuid primary key default gen_random_uuid(),
    reserva_habitacion_id uuid not null unique references reserva_habitacion(id) on delete cascade,
    checkin_real timestamptz,
    checkout_real timestamptz,
    estado_actual text not null default 'pendiente' check (estado_actual in ('pendiente','en_curso','finalizada')),
    saldo numeric(10,2) not null default 0
);

create table tareas_hk (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    habitacion_id uuid not null references habitaciones(id),
    tipo text not null check (tipo in ('limpieza','mantenimiento')),
    prioridad int not null default 100,
    estado text not null default 'planificado' check (estado in ('planificado','en_proceso','terminado')),
    con_huesped_dentro boolean not null default false,
    asignado_a uuid references personal(id),
    definido_por uuid references personal(id),
    iniciado_en timestamptz,
    finalizado_en timestamptz,
    -- Mensaje de estado corto para que recepción vea qué está pasando con
    -- la habitación mientras no hay huésped activo (ej. "Empezó la
    -- limpieza"). Se limpia solo cuando la tarea termina.
    notas text,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- MÓDULO 5: FINANCIERO (libro de cuentas, comprobantes, bazar)
-- ============================================================================

create table productos_bazar (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    nombre text not null,
    precio numeric(10,2) not null,
    activo boolean not null default true
);

-- Tipos de desayuno vendibles (ej. Continental, Americano), cada uno con su
-- propio precio -- para venta suelta a huéspedes que no lo tienen incluido
-- de cortesía en la tarifa (ver reserva_habitacion.incluye_desayuno).
create table tipos_desayuno (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    nombre text not null,
    precio numeric(10,2) not null,
    activo boolean not null default true
);

-- Libro único de cargos y abonos por estadía (reemplaza Pagos + Consumos + CuentasCobrar)
create table movimientos_cuenta (
    id uuid primary key default gen_random_uuid(),
    estadia_id uuid not null references estadias(id) on delete cascade,
    tipo text not null check (tipo in ('alquiler','consumo_bazar','pago','early','late','ajuste','cochera','desayuno','mascota')),
    monto numeric(10,2) not null,       -- positivo = cargo, negativo = abono/pago
    metodo_pago text check (metodo_pago in ('efectivo','transferencia','yape','tarjeta')),
    producto_id uuid references productos_bazar(id),
    tipo_desayuno_id uuid references tipos_desayuno(id),
    pagado_al_momento boolean default true,
    sesion_turno_id uuid references sesiones_turno(id),
    fecha timestamptz not null default now(),
    notas text,
    -- Quién generó el cargo/abono, para el detalle de cuentas x cobrar.
    registrado_por uuid references personal(id),
    -- Pagos en dólares: el monto de arriba siempre queda en soles (para
    -- que el saldo/caja se mantengan en una sola moneda); estas columnas
    -- son solo trazabilidad de que ese monto vino de una conversión.
    moneda_pago text check (moneda_pago in ('PEN','USD')),
    monto_original numeric(10,2),
    tipo_cambio_aplicado numeric(6,3)
);

create table comprobantes (
    id uuid primary key default gen_random_uuid(),
    estadia_id uuid not null references estadias(id) on delete cascade,
    tipo text not null check (tipo in ('boleta','factura')),
    estado text not null default 'pendiente' check (estado in ('pendiente','emitido')),
    monto numeric(10,2) not null,
    nro_comprobante text,
    sesion_turno_id uuid references sesiones_turno(id),
    created_at timestamptz not null default now()
);

create table tipo_cambio (
    fecha date primary key default current_date,
    valor_compra numeric(6,3) not null,
    valor_venta numeric(6,3) not null
);

-- ============================================================================
-- MÓDULO 6: COTIZACIONES
-- ============================================================================

create table cotizaciones (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    huesped_id uuid references huespedes(id),
    empresa_id uuid references empresas(id),
    fecha_emision date not null default current_date,
    fecha_desde date not null,
    fecha_hasta date not null,
    estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','convertida','vencida','cancelada')),
    moneda text not null default 'PEN',
    total_estimado numeric(10,2),
    creado_por uuid references personal(id),
    reserva_id uuid references reservas(id),
    vence_en date
);

create table cotizacion_detalle (
    id uuid primary key default gen_random_uuid(),
    cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
    habitacion_id uuid not null references habitaciones(id),
    tarifa_id uuid references tarifas(id),
    nro_personas int not null default 1,
    dias int not null default 1,
    precio_noche numeric(10,2) not null,
    subtotal numeric(10,2) not null
);

-- ============================================================================
-- MÓDULO 7: INTEGRACIÓN BOOKING / AIRBNB (Opción B - lectura de correo)
-- ============================================================================

create table importaciones_canal (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid not null references hoteles(id) on delete cascade,
    canal text not null check (canal in ('booking','airbnb')),
    correo_origen text,
    fecha_recibido timestamptz not null default now(),
    estado_parseo text not null default 'pendiente' check (estado_parseo in ('pendiente','ok','error')),
    reserva_id uuid references reservas(id),
    datos_crudos jsonb,
    error_detalle text
);

-- ============================================================================
-- ÍNDICES DE APOYO
-- ============================================================================

create index idx_habitaciones_hotel on habitaciones(hotel_id);
create index idx_reservas_hotel on reservas(hotel_id);
create index idx_reserva_hab_reserva on reserva_habitacion(reserva_id);
create index idx_reserva_hab_habitacion on reserva_habitacion(habitacion_id);
create index idx_reserva_hab_checkin on reserva_habitacion(fecha_hora_checkin_prevista);
create index idx_reserva_hab_checkout on reserva_habitacion(fecha_hora_checkout_prevista);
create index idx_movimientos_cuenta_estadia on movimientos_cuenta(estadia_id);
create index idx_movimientos_caja_sesion on movimientos_caja(sesion_turno_id);
create index idx_tareas_hk_hotel_estado on tareas_hk(hotel_id, estado);
create index idx_personal_hotel_personal on personal_hotel(personal_id);
create index idx_personal_hotel_hotel on personal_hotel(hotel_id);

-- ============================================================================
-- FUNCIONES DE APOYO PARA RLS
-- ============================================================================

-- security definer: estas funciones se llaman DESDE las policies de RLS de
-- personal/personal_hotel (entre otras). Sin security definer, su propia
-- consulta a `personal`/`personal_hotel` vuelve a disparar esas mismas
-- policies -> recursión infinita ("stack depth limit exceeded"). Al correr
-- con los privilegios del dueño de la función (que sí puede leer sin RLS),
-- se cortan en una sola vuelta. set search_path fijo por buena práctica de
-- seguridad en funciones security definer.
create or replace function my_personal_id()
returns uuid
language sql stable security definer set search_path = public
as $$
    select id from personal where auth_user_id = auth.uid();
$$;

create or replace function is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
    select coalesce((select es_super_admin from personal where auth_user_id = auth.uid()), false);
$$;

create or replace function my_hotel_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
    select hotel_id from personal_hotel
    where personal_id = my_personal_id() and activo = true;
$$;

create or replace function my_hotel_ids_by_rol(p_rol text)
returns setof uuid
language sql stable security definer set search_path = public
as $$
    select hotel_id from personal_hotel
    where personal_id = my_personal_id() and activo = true and rol = p_rol;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table hoteles enable row level security;
alter table personal enable row level security;
alter table personal_hotel enable row level security;
alter table turnos enable row level security;
alter table sesiones_turno enable row level security;
alter table movimientos_caja enable row level security;
alter table tipos_habitacion enable row level security;
alter table habitaciones enable row level security;
alter table cocheras enable row level security;
alter table tarifas enable row level security;
alter table huespedes enable row level security;
alter table empresas enable row level security;
alter table tarifas_especiales enable row level security;
alter table reservas enable row level security;
alter table reserva_habitacion enable row level security;
alter table vehiculos enable row level security;
alter table estadias enable row level security;
alter table tareas_hk enable row level security;
alter table productos_bazar enable row level security;
alter table tipos_desayuno enable row level security;
alter table movimientos_cuenta enable row level security;
alter table comprobantes enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_detalle enable row level security;
alter table importaciones_canal enable row level security;
alter table tipo_cambio enable row level security;

-- Patrón general: super_admin ve todo; el resto solo ve datos de sus hoteles asignados.

-- Sin esta policy nadie puede leer ni su propia fila de `personal` (RLS
-- deniega todo por defecto sin policies) y el AuthGuard falla siempre con
-- "sin perfil de personal activo". Cada quien lee su propia fila; cualquier
-- colega asignado a un hotel en común ve el nombre de los demás (nombres no
-- son un dato sensible, y el libro de movimientos_cuenta necesita mostrar
-- quién generó cada cargo, no solo el admin); super_admin ve todo.
create policy p_personal on personal for select
    using (
        is_super_admin()
        or auth_user_id = auth.uid()
        or id in (
            select ph.personal_id from personal_hotel ph
            where ph.hotel_id in (select my_hotel_ids())
        )
    );

create policy p_hoteles on hoteles for select
    using (is_super_admin() or id in (select my_hotel_ids()));

-- Solo el admin del hotel puede editar su configuracion (horas de
-- check-in/checkout, modo 24h).
create policy p_hoteles_update on hoteles for update
    using (is_super_admin() or id in (select my_hotel_ids_by_rol('admin')))
    with check (is_super_admin() or id in (select my_hotel_ids_by_rol('admin')));

create policy p_tipos_habitacion on tipos_habitacion for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_habitaciones on habitaciones for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_cocheras on cocheras for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_tarifas on tarifas for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_huespedes on huespedes for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_empresas on empresas for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_tarifas_especiales on tarifas_especiales for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_reservas on reservas for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_reserva_habitacion on reserva_habitacion for all
    using (is_super_admin() or reserva_id in (select id from reservas where hotel_id in (select my_hotel_ids())));

create policy p_vehiculos on vehiculos for all
    using (is_super_admin() or reserva_habitacion_id in (
        select rh.id from reserva_habitacion rh join reservas r on r.id = rh.reserva_id
        where r.hotel_id in (select my_hotel_ids())));

create policy p_estadias on estadias for all
    using (is_super_admin() or reserva_habitacion_id in (
        select rh.id from reserva_habitacion rh join reservas r on r.id = rh.reserva_id
        where r.hotel_id in (select my_hotel_ids())));

create policy p_tareas_hk on tareas_hk for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_productos_bazar on productos_bazar for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_tipos_desayuno on tipos_desayuno for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_movimientos_cuenta on movimientos_cuenta for all
    using (is_super_admin() or estadia_id in (
        select e.id from estadias e
        join reserva_habitacion rh on rh.id = e.reserva_habitacion_id
        join reservas r on r.id = rh.reserva_id
        where r.hotel_id in (select my_hotel_ids())));

create policy p_comprobantes on comprobantes for all
    using (is_super_admin() or estadia_id in (
        select e.id from estadias e
        join reserva_habitacion rh on rh.id = e.reserva_habitacion_id
        join reservas r on r.id = rh.reserva_id
        where r.hotel_id in (select my_hotel_ids())));

create policy p_cotizaciones on cotizaciones for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_cotizacion_detalle on cotizacion_detalle for all
    using (is_super_admin() or cotizacion_id in (select id from cotizaciones where hotel_id in (select my_hotel_ids())));

create policy p_importaciones_canal on importaciones_canal for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

create policy p_personal_hotel on personal_hotel for select
    using (is_super_admin() or personal_id = my_personal_id() or hotel_id in (select my_hotel_ids_by_rol('admin')));

-- Altas de personal: solo un admin (de cualquiera de sus hoteles) o
-- super_admin puede crear personas nuevas o asignarlas/reasignarlas a un
-- hotel. Sin estas dos, PersonalModule no podría insertar nada (personal y
-- personal_hotel solo tenían policy de SELECT).
create policy p_personal_insert on personal for insert
    with check (is_super_admin() or exists (select 1 from my_hotel_ids_by_rol('admin')));

create policy p_personal_update on personal for update
    using (is_super_admin() or exists (select 1 from my_hotel_ids_by_rol('admin')))
    with check (is_super_admin() or exists (select 1 from my_hotel_ids_by_rol('admin')));

create policy p_personal_hotel_insert on personal_hotel for insert
    with check (is_super_admin() or hotel_id in (select my_hotel_ids_by_rol('admin')));

create policy p_personal_hotel_update on personal_hotel for update
    using (is_super_admin() or hotel_id in (select my_hotel_ids_by_rol('admin')))
    with check (is_super_admin() or hotel_id in (select my_hotel_ids_by_rol('admin')));

create policy p_turnos on turnos for all
    using (is_super_admin() or hotel_id in (select my_hotel_ids()));

-- Tipo de cambio: dato del país, no de un hotel en particular -- lectura
-- abierta a cualquier autenticado (se muestra en la parte superior de
-- toda la app), escritura solo para quien sea admin de al menos un hotel.
create policy p_tipo_cambio_select on tipo_cambio for select
    using (true);

create policy p_tipo_cambio_insert on tipo_cambio for insert
    with check (is_super_admin() or exists (select 1 from my_hotel_ids_by_rol('admin')));

create policy p_tipo_cambio_update on tipo_cambio for update
    using (is_super_admin() or exists (select 1 from my_hotel_ids_by_rol('admin')));

-- CAJA: aislamiento estricto. Cada recepcionista ve solo sus propias sesiones;
-- el admin del hotel ve el consolidado de todo su hotel; el super_admin ve todo.
create policy p_sesiones_turno on sesiones_turno for select
    using (
        is_super_admin()
        or personal_hotel_id in (select id from personal_hotel where personal_id = my_personal_id())
        or personal_hotel_id in (
            select ph.id from personal_hotel ph
            where ph.hotel_id in (select my_hotel_ids_by_rol('admin'))
        )
    );

create policy p_sesiones_turno_insert on sesiones_turno for insert
    with check (
        personal_hotel_id in (select id from personal_hotel where personal_id = my_personal_id())
    );

-- Permite a cada recepcionista cerrar (liquidar) sus propias sesiones de
-- turno. Sin esta policy el UPDATE de cierre queda bloqueado por RLS.
create policy p_sesiones_turno_update on sesiones_turno for update
    using (personal_hotel_id in (select id from personal_hotel where personal_id = my_personal_id()))
    with check (personal_hotel_id in (select id from personal_hotel where personal_id = my_personal_id()));

create policy p_movimientos_caja on movimientos_caja for select
    using (
        is_super_admin()
        or sesion_turno_id in (
            select st.id from sesiones_turno st
            join personal_hotel ph on ph.id = st.personal_hotel_id
            where ph.personal_id = my_personal_id()
               or ph.hotel_id in (select my_hotel_ids_by_rol('admin'))
        )
    );

create policy p_movimientos_caja_insert on movimientos_caja for insert
    with check (
        sesion_turno_id in (
            select st.id from sesiones_turno st
            join personal_hotel ph on ph.id = st.personal_hotel_id
            where ph.personal_id = my_personal_id()
        )
    );
