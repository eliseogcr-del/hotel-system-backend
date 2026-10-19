-- Camino 2 de la revisión multi-empresa (ver conversación): hoy `hoteles`
-- es el tenant raíz y `personal.es_super_admin` es un flag GLOBAL -- ve
-- todos los hoteles de la base, sin importar de qué empresa son. Eso
-- funciona bien para una sola cadena (Hotel Jorge Chávez) pero no aísla
-- a dos empresas distintas que compartan la misma base de datos.
--
-- Esta migración agrega una capa de agrupación por encima de `hoteles`
-- (`organizaciones`) y un rol "admin de organización" (ve/administra
-- todos los hoteles de SU organización, nada más) sin tocar ninguna tabla
-- operativa ni cambiarle el acceso a nadie que ya existe:
--   - Todo hotel/personal existente queda asignado a una organización por
--     defecto que esta misma migración crea.
--   - `es_admin_organizacion` nace en false para todo el mundo.
--   - `es_super_admin` no se toca -- sigue siendo "ve literalmente todo,
--     de cualquier organización" (reservar ese flag solo para la cuenta
--     del operador de la plataforma, no para clientes, es responsabilidad
--     operativa de ahora en adelante, no algo que la migración pueda
--     decidir por sí sola).
--
-- No hay (todavía) pantalla para crear organizaciones/hoteles nuevos --
-- al día de hoy solo existe un hotel. Cuando llegue la segunda empresa, se
-- crea su fila en `organizaciones` y su `hoteles.organizacion_id` a mano,
-- igual que se creó el hotel original.

create table if not exists organizaciones (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    activo boolean not null default true,
    created_at timestamptz not null default now()
);

-- 1) Columna nullable primero, para poder rellenarla sin romper filas ya
--    existentes; recién al final se pone NOT NULL.
alter table hoteles add column if not exists organizacion_id uuid references organizaciones(id);

-- 2) Organización por defecto para todo lo que ya existe hoy (un solo
--    insert, reutilizable si la migración se corre más de una vez).
insert into organizaciones (nombre)
select 'Organización principal'
where not exists (select 1 from organizaciones);

-- 3) Backfill: cualquier hotel sin organización asignada pasa a la
--    organización por defecto (la primera que exista -- en una base
--    recién migrada es la que se acaba de crear arriba).
update hoteles
set organizacion_id = (select id from organizaciones order by created_at limit 1)
where organizacion_id is null;

-- 4) Recién ahora se exige que todo hotel tenga organización.
alter table hoteles alter column organizacion_id set not null;

-- Personal: a qué organización pertenece (null = no asociado a ninguna en
-- particular, el caso típico de una cuenta con es_super_admin=true que no
-- es "de" ninguna empresa cliente) y si administra TODOS los hoteles de
-- esa organización (no solo los que tiene en personal_hotel).
alter table personal add column if not exists organizacion_id uuid references organizaciones(id);
alter table personal add column if not exists es_admin_organizacion boolean not null default false;

alter table organizaciones enable row level security;

-- Cada quien ve el nombre de su propia organización (para mostrarlo en
-- algún lado de la UI más adelante); super_admin las ve todas. Crear/editar
-- organizaciones queda fuera de RLS por ahora -- no hay UI para eso, se
-- hace a mano en Supabase con la service_role key cuando haga falta.
create policy p_organizaciones on organizaciones for select
    using (is_super_admin() or id = (select organizacion_id from personal where auth_user_id = auth.uid()));

-- ============================================================================
-- Funciones de apoyo para RLS: se REDEFINEN (create or replace) para que un
-- admin de organización cuente como si tuviera, en CADA hotel de su
-- organización, una fila de personal_hotel con rol 'admin' -- sin tener que
-- tocar ninguna de las ~20 policies existentes que ya llaman a
-- my_hotel_ids()/my_hotel_ids_by_rol('admin'). Para todo el personal actual
-- (es_admin_organizacion = false) el UNION de abajo no agrega ninguna fila
-- extra: el resultado es idéntico al de antes de esta migración.
-- ============================================================================

create or replace function my_hotel_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
    select hotel_id from personal_hotel
    where personal_id = my_personal_id() and activo = true
    union
    select h.id from hoteles h
    join personal p on p.organizacion_id = h.organizacion_id
    where p.id = my_personal_id() and p.es_admin_organizacion = true
$$;

create or replace function my_hotel_ids_by_rol(p_rol text)
returns setof uuid
language sql stable security definer set search_path = public
as $$
    select hotel_id from personal_hotel
    where personal_id = my_personal_id() and activo = true and rol = p_rol
    union
    select h.id from hoteles h
    join personal p on p.organizacion_id = h.organizacion_id
    where p.id = my_personal_id() and p.es_admin_organizacion = true and p_rol = 'admin'
$$;
